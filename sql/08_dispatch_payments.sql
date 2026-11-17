-- =====================================================================
-- ServeGo — 08_dispatch_payments.sql
-- Fluxo "estilo Uber": o cliente pede, o sistema chama o profissional
-- disponível MAIS PRÓXIMO, ele aceita e o cliente PAGA ANTES, dentro do
-- app. O dinheiro fica retido e só é repassado após a conclusão.
--
--   1. cliente cria a solicitação (status 'matching')
--   2. dispatch_next()  → oferece a chamada ao mais próximo (expira em N s)
--   3. respond_dispatch() → profissional aceita (ou recusa → próximo)
--      solicitação vai para 'awaiting_payment' com preço fechado
--   4. Edge Function create-payment → cobrança Pix/cartão no gateway
--   5. webhook do gateway → confirm_payment() → cria o booking
--   6. conclusão → transação 'pending' (a liberar) para o profissional
--   7. cancelamento antes de "a caminho" → estorno (Edge Function refund-payment)
--
-- Rode DEPOIS de 01..07. É idempotente.
--
-- ATENÇÃO: o Postgres não deixa usar um valor novo de enum na mesma
-- transação em que ele foi criado. Se o SQL Editor acusar
-- "unsafe use of new value", rode a seção 1 sozinha e depois o resto.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Novos estados da solicitação
-- ---------------------------------------------------------------------
alter type public.request_status add value if not exists 'awaiting_payment';
alter type public.request_status add value if not exists 'no_professional';

do $$ begin
  create type public.dispatch_status as enum ('pending','accepted','declined','expired','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('pending','paid','refunded','failed','expired');
exception when duplicate_object then null; end $$;

alter table public.service_requests
  add column if not exists price           numeric(10,2),   -- preço fechado mostrado ao cliente
  add column if not exists professional_id uuid references public.professionals(id),
  add column if not exists payment_due_at  timestamptz;     -- prazo para pagar antes de liberar o profissional

-- Configurações do despacho (editáveis em app_settings)
insert into public.app_settings (key, value) values
  ('dispatch_timeout_seconds', '45'::jsonb),
  ('payment_timeout_minutes',  '15'::jsonb),
  ('urgency_surcharge_percent','20'::jsonb)
on conflict (key) do nothing;

create or replace function public.setting_num(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::numeric from public.app_settings where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------
-- 2. Chamadas (uma linha por profissional chamado)
-- ---------------------------------------------------------------------
create table if not exists public.dispatch_offers (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references public.service_requests(id) on delete cascade,
  professional_id uuid not null references public.professionals(id)    on delete cascade,
  rank            int  not null,                 -- 1 = o mais próximo
  distance_km     double precision,
  eta_minutes     int,
  price           numeric(10,2) not null,
  status          public.dispatch_status not null default 'pending',
  expires_at      timestamptz not null,
  responded_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (request_id, professional_id)
);
create index if not exists idx_dispatch_request on public.dispatch_offers (request_id, created_at desc);
create index if not exists idx_dispatch_pro     on public.dispatch_offers (professional_id, status);

alter table public.dispatch_offers enable row level security;
drop policy if exists "dispatch_select_parties" on public.dispatch_offers;
drop policy if exists "dispatch_admin_all"      on public.dispatch_offers;

create policy "dispatch_select_parties"
  on public.dispatch_offers for select
  to authenticated
  using (
    professional_id = auth.uid()
    or exists (select 1 from public.service_requests r where r.id = request_id and r.client_id = auth.uid())
  );

-- Escrita só pelas funções abaixo (SECURITY DEFINER) e pelo admin.
create policy "dispatch_admin_all"
  on public.dispatch_offers for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. Pagamentos (sempre dentro da plataforma)
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references public.service_requests(id) on delete cascade,
  booking_id      uuid references public.bookings(id),
  client_id       uuid not null references public.profiles(id),
  professional_id uuid references public.professionals(id),
  amount          numeric(10,2) not null,
  platform_fee    numeric(10,2) not null default 0,
  method          text not null check (method in ('pix','card')),
  provider        text not null default 'mercadopago',
  provider_ref    text,                          -- id do pagamento no gateway
  status          public.payment_status not null default 'pending',
  pix_qr_code     text,                          -- copia e cola
  pix_qr_base64   text,                          -- imagem do QR
  checkout_url    text,                          -- cartão: checkout seguro do gateway
  expires_at      timestamptz,
  paid_at         timestamptz,
  refunded_at     timestamptz,
  refund_amount   numeric(10,2),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_payments_request on public.payments (request_id);
create index if not exists idx_payments_status  on public.payments (status, created_at desc);
create unique index if not exists idx_payments_provider_ref on public.payments (provider, provider_ref) where provider_ref is not null;

alter table public.payments enable row level security;
drop policy if exists "payments_select_parties" on public.payments;
drop policy if exists "payments_admin_all"      on public.payments;

create policy "payments_select_parties"
  on public.payments for select
  to authenticated
  using (client_id = auth.uid() or professional_id = auth.uid());

-- Inserção/atualização só pelas Edge Functions (service_role) e admin.
create policy "payments_admin_all"
  on public.payments for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- O booking passa a apontar para o pagamento
alter table public.bookings add column if not exists payment_id uuid references public.payments(id);
alter table public.transactions add column if not exists payment_id uuid references public.payments(id);

-- Ninguém cria booking pelo app: só confirm_payment().
drop policy if exists "bookings_insert_client" on public.bookings;

-- O valor pago não muda depois: nem cliente nem profissional alteram o preço.
create or replace function public.guard_booking_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price is distinct from old.price and not public.is_admin() and auth.uid() is not null then
    raise exception 'O valor do serviço já foi pago e não pode ser alterado.' using errcode = '42501';
  end if;
  if new.payment_id is distinct from old.payment_id and not public.is_admin() and auth.uid() is not null then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bookings_guard_price on public.bookings;
create trigger trg_bookings_guard_price
  before update on public.bookings
  for each row execute function public.guard_booking_price();

-- ---------------------------------------------------------------------
-- 4. Preço fechado
--    preço do profissional para a categoria (ou o base_price dele, ou o
--    mínimo da categoria) + adicional de urgência quando é "agora".
-- ---------------------------------------------------------------------
create or replace function public.quote_price(p_professional_id uuid, p_request_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(
    coalesce(pc.price_from, pro.base_price, c.price_from, 120)
    * case when r.urgency = 'now'
           then 1 + public.setting_num('urgency_surcharge_percent', 20) / 100
           else 1 end
  , 2)
  from public.service_requests r
  join public.professionals pro on pro.id = p_professional_id
  left join public.categories c on c.id = r.category_id
  left join public.professional_categories pc
    on pc.professional_id = pro.id and pc.category_id = r.category_id
  where r.id = p_request_id;
$$;

-- ---------------------------------------------------------------------
-- 5. Despacho: chama o próximo profissional mais próximo
-- ---------------------------------------------------------------------
create or replace function public.dispatch_next(p_request_id uuid)
returns public.dispatch_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  r       public.service_requests;
  cand    record;
  v_offer public.dispatch_offers;
  v_rank  int;
begin
  select * into r from public.service_requests where id = p_request_id for update;
  if r.id is null then
    raise exception 'Solicitação não encontrada.' using errcode = 'P0002';
  end if;
  if r.client_id <> auth.uid() and not public.is_admin() and auth.uid() is not null then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if r.status not in ('open','matching','no_professional') then
    return null;  -- já aceita/paga/cancelada
  end if;

  -- encerra a chamada vencida, se houver
  update public.dispatch_offers
     set status = 'expired', responded_at = now()
   where request_id = r.id and status = 'pending' and expires_at <= now();

  -- uma chamada ainda válida? então não chama ninguém novo
  select * into v_offer from public.dispatch_offers
   where request_id = r.id and status = 'pending' and expires_at > now()
   limit 1;
  if v_offer.id is not null then
    return v_offer;
  end if;

  -- o mais próximo, online, verificado, que ainda não foi chamado para este pedido
  select s.id, s.distance_km, s.eta_minutes
    into cand
    from public.search_professionals(r.category_id, r.lat, r.lng, 50, 50) s
   where not exists (
           select 1 from public.dispatch_offers d
            where d.request_id = r.id and d.professional_id = s.id)
     and not exists (   -- quem já está em atendimento não recebe chamada
           select 1 from public.bookings b
            where b.professional_id = s.id
              and b.status in ('accepted','on_the_way','arrived','in_progress'))
   order by s.distance_km nulls last, s.rating desc
   limit 1;

  if cand.id is null then
    update public.service_requests set status = 'no_professional', updated_at = now() where id = r.id;
    perform public.notify(r.client_id, 'request', 'Nenhum profissional disponível agora',
      'Tente novamente em alguns minutos ou agende para outro horário.', '#/solicitacao/' || r.id);
    return null;
  end if;

  select coalesce(max(rank), 0) + 1 into v_rank from public.dispatch_offers where request_id = r.id;

  insert into public.dispatch_offers (request_id, professional_id, rank, distance_km, eta_minutes, price, expires_at)
  values (r.id, cand.id, v_rank, cand.distance_km, cand.eta_minutes,
          public.quote_price(cand.id, r.id),
          now() + make_interval(secs => public.setting_num('dispatch_timeout_seconds', 45)))
  returning * into v_offer;

  update public.service_requests set status = 'matching', updated_at = now() where id = r.id;

  perform public.notify(cand.id, 'dispatch', 'Nova chamada perto de você',
    r.title || ' · ' || coalesce(round(cand.distance_km::numeric, 1)::text || ' km', ''), '#/inicio');

  return v_offer;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Profissional responde à chamada
-- ---------------------------------------------------------------------
create or replace function public.respond_dispatch(p_offer_id uuid, p_accept boolean)
returns public.dispatch_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.dispatch_offers;
  r public.service_requests;
begin
  select * into o from public.dispatch_offers where id = p_offer_id for update;
  if o.id is null or o.professional_id <> auth.uid() then
    raise exception 'Chamada não encontrada.' using errcode = '42501';
  end if;
  if o.status <> 'pending' then
    raise exception 'Esta chamada não está mais disponível.' using errcode = 'P0001';
  end if;
  select * into r from public.service_requests where id = o.request_id for update;
  if r.status <> 'matching' then
    update public.dispatch_offers set status = 'cancelled', responded_at = now() where id = o.id;
    raise exception 'O cliente cancelou este pedido.' using errcode = 'P0001';
  end if;
  if o.expires_at <= now() then
    update public.dispatch_offers set status = 'expired', responded_at = now() where id = o.id;
    perform public.dispatch_next(o.request_id);
    raise exception 'O tempo para aceitar esta chamada acabou.' using errcode = 'P0001';
  end if;

  if not p_accept then
    update public.dispatch_offers set status = 'declined', responded_at = now() where id = o.id returning * into o;
    perform public.dispatch_next(o.request_id);
    return o;
  end if;

  update public.dispatch_offers set status = 'accepted', responded_at = now() where id = o.id returning * into o;
  update public.service_requests
     set status = 'awaiting_payment',
         price = o.price,
         professional_id = o.professional_id,
         payment_due_at = now() + make_interval(mins => public.setting_num('payment_timeout_minutes', 15)::int),
         updated_at = now()
   where id = o.request_id
  returning * into r;

  perform public.notify(r.client_id, 'dispatch', 'Profissional encontrado!',
    'Pague ' || to_char(o.price, 'FM"R$ "999G990D00') || ' no app para confirmar o atendimento.',
    '#/solicitacao/' || r.id);
  return o;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Pagamento confirmado (chamado SÓ pela Edge Function/webhook)
-- ---------------------------------------------------------------------
create or replace function public.confirm_payment(p_payment_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  p  public.payments;
  r  public.service_requests;
  bk public.bookings;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if p.id is null then
    raise exception 'Pagamento não encontrado.' using errcode = 'P0002';
  end if;

  -- idempotente: o webhook pode chegar mais de uma vez
  if p.status = 'paid' and p.booking_id is not null then
    select * into bk from public.bookings where id = p.booking_id;
    return bk;
  end if;

  select * into r from public.service_requests where id = p.request_id for update;

  update public.payments
     set status = 'paid', paid_at = coalesce(paid_at, now()), updated_at = now()
   where id = p.id;

  insert into public.bookings (request_id, client_id, professional_id, price, status, payment_id)
  values (r.id, r.client_id, r.professional_id, p.amount, 'accepted', p.id)
  on conflict (request_id) do update set payment_id = excluded.payment_id
  returning * into bk;

  update public.payments set booking_id = bk.id where id = p.id;
  update public.service_requests set status = 'assigned', updated_at = now() where id = r.id;

  perform public.notify(r.professional_id, 'booking', 'Pagamento confirmado — pode ir!',
    r.title || ' · ' || coalesce(r.address, ''), '#/servico/' || bk.id);
  perform public.notify(r.client_id, 'booking', 'Pagamento aprovado',
    'O profissional já foi avisado e está se preparando.', '#/acompanhar/' || bk.id);
  return bk;
end;
$$;
revoke execute on function public.confirm_payment(uuid) from public, anon, authenticated;
grant execute on function public.confirm_payment(uuid) to service_role;

-- Cancelar o pedido encerra a chamada e a cobrança em aberto
create or replace function public.close_dispatch_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.dispatch_offers set status = 'cancelled', responded_at = now()
     where request_id = new.id and status = 'pending';
    update public.payments set status = 'expired', updated_at = now()
     where request_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_requests_close_dispatch on public.service_requests;
create trigger trg_requests_close_dispatch
  after update of status on public.service_requests
  for each row execute function public.close_dispatch_on_cancel();

-- O cliente não pode se dar o status "pago": só confirm_payment() avança.
-- SECURITY INVOKER de propósito: current_user precisa ser quem fez a
-- alteração (authenticated) — dentro das funções do despacho e das Edge
-- Functions ele é postgres/service_role, que podem avançar o status.
create or replace function public.guard_request_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and not public.is_admin()
       and current_user not in ('postgres', 'service_role', 'supabase_admin') then
      if new.status not in ('open', 'matching') then new.status := 'matching'; end if;
      new.price := null;
      new.professional_id := null;
      new.payment_due_at := null;
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     and auth.uid() is not null and not public.is_admin()
     and new.status not in ('cancelled')
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Status da solicitação não pode ser alterado diretamente.' using errcode = '42501';
  end if;
  if (new.price is distinct from old.price or new.professional_id is distinct from old.professional_id)
     and auth.uid() is not null and not public.is_admin()
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_requests_guard_status on public.service_requests;
create trigger trg_requests_guard_status
  before insert or update on public.service_requests
  for each row execute function public.guard_request_status();

-- Prazo de pagamento vencido → libera o profissional e volta a buscar
create or replace function public.expire_unpaid(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.service_requests
     set status = 'cancelled', updated_at = now()
   where id = p_request_id
     and status = 'awaiting_payment'
     and payment_due_at < now()
     and (client_id = auth.uid() or public.is_admin());
  update public.payments set status = 'expired', updated_at = now()
   where request_id = p_request_id and status = 'pending';
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Comissão ligada ao pagamento
--    (o lançamento continua em on_booking_completed; aqui só ligamos
--     a transação ao pagamento do booking)
-- ---------------------------------------------------------------------
create or replace function public.link_transaction_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_id is null then
    select payment_id into new.payment_id from public.bookings where id = new.booking_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_transactions_payment on public.transactions;
create trigger trg_transactions_payment
  before insert on public.transactions
  for each row execute function public.link_transaction_payment();

-- ---------------------------------------------------------------------
-- 9. Pagamento só dentro do app: o chat bloqueia telefone, e-mail e links
-- ---------------------------------------------------------------------
create or replace function public.mask_contact_info()
returns trigger
language plpgsql
as $$
begin
  if new.content is not null then
    new.content := regexp_replace(new.content,
      '(\+?55\s?)?(\(?\d{2}\)?\s?)?9?\d{4}[\s.-]?\d{4}', '[contato oculto]', 'g');
    new.content := regexp_replace(new.content,
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contato oculto]', 'g');
    new.content := regexp_replace(new.content,
      '(https?://|www\.|wa\.me/|chave\s*pix)\S*', '[link oculto]', 'gi');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_messages_mask_contact on public.messages;
create trigger trg_messages_mask_contact
  before insert or update of content on public.messages
  for each row execute function public.mask_contact_info();

-- Fim do 08_dispatch_payments.sql
