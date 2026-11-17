-- =====================================================================
-- ServeGo — 12_admin_control.sql
-- Controle total pelo painel admin.
--
--   • Equipe: profiles.admin_role (owner, finance, moderation, support, ops)
--     — só o "owner" promove, rebaixa ou troca o papel de alguém.
--   • Contas: suspensão temporária (suspended_until) e anonimização (LGPD).
--   • Profissionais: destaque nas buscas (featured).
--   • Avaliações: ocultar (hidden) — some do app e sai da média do profissional.
--   • Notas internas da equipe (admin_notes), invisíveis para os usuários.
--   • Configurações novas (raio de busca, valor mínimo, modo manutenção,
--     cadastros abertos, contatos de suporte, termos e privacidade).
--   • dispatch_next passa a usar o raio configurável.
--   • Ações administrativas em pedidos: relançar chamada e cancelar.
--
-- Rode DEPOIS de 01..11. É idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Equipe e papéis administrativos
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists admin_role text;
alter table public.profiles add column if not exists suspended_until timestamptz;
alter table public.profiles add column if not exists anonymized_at timestamptz;

do $$ begin
  alter table public.profiles add constraint profiles_admin_role_chk
    check (admin_role is null or admin_role in ('owner', 'finance', 'moderation', 'support', 'ops'));
exception when duplicate_object then null; end $$;

-- Admins que já existiam viram "owner" (mantém o acesso total de antes).
update public.profiles set admin_role = 'owner' where role = 'admin' and admin_role is null;

-- Substitui a regra do 05_admin.sql ("só o e-mail dono pode ser admin"):
--   • o e-mail dono continua sempre admin/owner;
--   • outra conta só vira admin por ação de um owner (tela Equipe);
--   • ninguém se cadastra como admin.
-- ATENÇÃO: rodar o 05 de novo depois deste arquivo volta a regra antiga e
-- rebaixa a equipe. Se precisar, rode o 12 em seguida.
create or replace function public.enforce_admin_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.email, '')) = public.servego_owner_email() then
    new.role := 'admin';
    new.status := 'active';
    new.admin_role := 'owner';
    return new;
  end if;
  if new.role = 'admin' then
    if tg_op = 'UPDATE' and old.role = 'admin' then
      return new;                                   -- já fazia parte da equipe
    end if;
    if auth.uid() is not null and public.is_owner(auth.uid()) then
      return new;                                   -- o dono adicionou pela tela Equipe
    end if;
    raise exception 'Somente o dono da plataforma pode adicionar alguém à equipe.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function public.enforce_admin_role() is
  'O e-mail dono é sempre admin/owner; outras contas só viram admin por ação de um owner.';

create or replace function public.is_owner(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = uid and role = 'admin' and admin_role = 'owner');
$$;
grant execute on function public.is_owner(uuid) to authenticated;

-- Só o owner altera papel (role/admin_role) de qualquer conta.
-- SECURITY INVOKER de propósito: current_user identifica service_role/postgres.
create or replace function public.guard_admin_roles()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.admin_role is distinct from old.admin_role)
     and auth.uid() is not null
     and current_user not in ('postgres', 'service_role', 'supabase_admin')
     and not public.is_owner() then
    raise exception 'Apenas o dono da plataforma pode alterar papéis e permissões.' using errcode = '42501';
  end if;
  if new.role <> 'admin' then new.admin_role := null; end if;
  if new.role = 'admin' and new.admin_role is null then new.admin_role := 'support'; end if;
  -- o último owner não pode ser rebaixado
  if old.admin_role = 'owner' and new.admin_role is distinct from 'owner'
     and (select count(*) from public.profiles where admin_role = 'owner' and id <> old.id) = 0 then
    raise exception 'A plataforma precisa de pelo menos um dono.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_admin_roles on public.profiles;
create trigger trg_profiles_guard_admin_roles
  before update on public.profiles
  for each row execute function public.guard_admin_roles();

-- ---------------------------------------------------------------------
-- 2. Suspensão temporária: is_active considera a data
-- ---------------------------------------------------------------------
create or replace function public.is_suspended(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles
                  where id = uid and suspended_until is not null and suspended_until > now());
$$;
grant execute on function public.is_suspended(uuid) to authenticated;

-- Contas suspensas não criam pedidos nem mandam mensagens.
drop policy if exists "requests_block_suspended" on public.service_requests;
create policy "requests_block_suspended"
  on public.service_requests as restrictive for insert
  to authenticated
  with check (not public.is_suspended());

drop policy if exists "messages_block_suspended" on public.messages;
create policy "messages_block_suspended"
  on public.messages as restrictive for insert
  to authenticated
  with check (not public.is_suspended());

-- ---------------------------------------------------------------------
-- 3. Profissional em destaque
-- ---------------------------------------------------------------------
alter table public.professionals add column if not exists featured boolean not null default false;

-- ---------------------------------------------------------------------
-- 4. Avaliações ocultas
-- ---------------------------------------------------------------------
alter table public.reviews add column if not exists hidden boolean not null default false;
alter table public.reviews add column if not exists hidden_reason text;

drop policy if exists "reviews_select_all" on public.reviews;
create policy "reviews_select_all"
  on public.reviews for select
  to anon, authenticated
  using (not hidden or public.is_admin() or client_id = auth.uid() or professional_id = auth.uid());

-- A média do profissional ignora avaliações ocultas.
create or replace function public.refresh_professional_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_professional_id uuid;
begin
  v_professional_id := coalesce(new.professional_id, old.professional_id);
  update public.professionals p
     set rating = coalesce(agg.avg_rating, 0),
         reviews_count = coalesce(agg.total, 0),
         updated_at = now()
    from (
      select round(avg(r.rating)::numeric, 2) as avg_rating, count(*) as total
        from public.reviews r
       where r.professional_id = v_professional_id and not r.hidden
    ) agg
   where p.id = v_professional_id;
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Notas internas da equipe
-- ---------------------------------------------------------------------
create table if not exists public.admin_notes (
  id           uuid primary key default gen_random_uuid(),
  target_type  text not null check (target_type in ('profile', 'request', 'booking', 'dispute')),
  target_id    uuid not null,
  body         text not null check (char_length(body) between 1 and 4000),
  author_id    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists admin_notes_target_idx on public.admin_notes (target_type, target_id, created_at desc);

alter table public.admin_notes enable row level security;
drop policy if exists "admin_notes_admin_all" on public.admin_notes;
create policy "admin_notes_admin_all"
  on public.admin_notes for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 6. Configurações novas (com padrão)
-- ---------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('dispatch_radius_km',        '30'::jsonb),
  ('min_order_value',           '50'::jsonb),
  ('signups_open',              'true'::jsonb),
  ('require_identity',          'true'::jsonb),
  ('maintenance_mode',          'false'::jsonb),
  ('maintenance_message',       '"Estamos fazendo uma melhoria rápida. Voltamos em instantes."'::jsonb),
  ('support_email',             '"suporte@servego.com.br"'::jsonb),
  ('support_whatsapp',          '""'::jsonb),
  ('terms_text',                '""'::jsonb),
  ('privacy_text',              '""'::jsonb)
on conflict (key) do nothing;

-- Faixas válidas das configurações numéricas novas
create or replace function public.validate_app_settings_extra()
returns trigger
language plpgsql
as $$
declare
  v numeric;
begin
  if new.key in ('dispatch_radius_km', 'min_order_value') then
    begin
      v := (new.value #>> '{}')::numeric;
    exception when others then
      raise exception 'Valor inválido para %.', new.key using errcode = '22023';
    end;
    if new.key = 'dispatch_radius_km' and (v < 1 or v > 200) then
      raise exception 'O raio de busca deve ficar entre 1 e 200 km.' using errcode = '22023';
    end if;
    if new.key = 'min_order_value' and (v < 0 or v > 5000) then
      raise exception 'O valor mínimo deve ficar entre R$ 0 e R$ 5.000.' using errcode = '22023';
    end if;
  end if;
  if new.key in ('signups_open', 'require_identity', 'maintenance_mode')
     and jsonb_typeof(new.value) <> 'boolean' then
    raise exception 'A configuração % é liga/desliga.', new.key using errcode = '22023';
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_app_settings_validate_extra on public.app_settings;
create trigger trg_app_settings_validate_extra
  before insert or update on public.app_settings
  for each row execute function public.validate_app_settings_extra();

-- Cadastros fechados: novos usuários (não admin) não entram.
create or replace function public.guard_signups_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'signups_open'), true) = false
     and new.role <> 'admin' then
    raise exception 'Os cadastros estão temporariamente fechados.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_profiles_signups_open on public.profiles;
create trigger trg_profiles_signups_open
  before insert on public.profiles
  for each row execute function public.guard_signups_open();

-- ---------------------------------------------------------------------
-- 7. dispatch_next com raio configurável (corpo igual ao do 08)
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
    return null;
  end if;

  update public.dispatch_offers
     set status = 'expired', responded_at = now()
   where request_id = r.id and status = 'pending' and expires_at <= now();

  select * into v_offer from public.dispatch_offers
   where request_id = r.id and status = 'pending' and expires_at > now()
   limit 1;
  if v_offer.id is not null then
    return v_offer;
  end if;

  select s.id, s.distance_km, s.eta_minutes
    into cand
    from public.search_professionals(r.category_id, r.lat, r.lng,
           public.setting_num('dispatch_radius_km', 30)::int, 50) s
   where not exists (
           select 1 from public.dispatch_offers d
            where d.request_id = r.id and d.professional_id = s.id)
     and not exists (
           select 1 from public.bookings b
            where b.professional_id = s.id
              and b.status in ('accepted','on_the_way','arrived','in_progress'))
     and not public.is_suspended(s.id)
   order by (select featured from public.professionals where id = s.id) desc,
            s.distance_km nulls last, s.rating desc
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
-- 8. Ações administrativas em pedidos
-- ---------------------------------------------------------------------

-- Relança a chamada: cancela a oferta pendente e chama o próximo da fila.
create or replace function public.admin_redispatch(p_request_id uuid)
returns public.dispatch_offers
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  update public.dispatch_offers set status = 'cancelled', responded_at = now()
   where request_id = p_request_id and status = 'pending';
  update public.service_requests set status = 'matching', updated_at = now()
   where id = p_request_id and status in ('open', 'matching', 'no_professional');
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'request.redispatch', 'request', p_request_id, '{}'::jsonb);
  return public.dispatch_next(p_request_id);
end;
$$;
grant execute on function public.admin_redispatch(uuid) to authenticated;

-- Cancela o pedido (e o serviço, se houver). O estorno do pagamento, quando
-- existir, é feito pela Edge Function refund-payment (fala com o gateway).
create or replace function public.admin_cancel_request(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.service_requests;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select * into r from public.service_requests where id = p_request_id for update;
  if r.id is null then
    raise exception 'Solicitação não encontrada.' using errcode = 'P0002';
  end if;
  update public.dispatch_offers set status = 'cancelled', responded_at = now()
   where request_id = r.id and status = 'pending';
  update public.bookings set status = 'cancelled', updated_at = now()
   where request_id = r.id and status not in ('completed', 'cancelled');
  update public.service_requests set status = 'cancelled', updated_at = now() where id = r.id;
  perform public.notify(r.client_id, 'request', 'Pedido cancelado pela equipe ServeGo',
    coalesce(nullif(p_reason, ''), 'Entre em contato com o suporte se tiver dúvidas.'), '#/solicitacao/' || r.id);
  if r.professional_id is not null then
    perform public.notify(r.professional_id, 'request', 'Serviço cancelado pela equipe ServeGo',
      coalesce(nullif(p_reason, ''), r.title), '#/servicos');
  end if;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'request.cancelled', 'request', r.id, jsonb_build_object('motivo', p_reason));
end;
$$;
grant execute on function public.admin_cancel_request(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Anonimização (LGPD): apaga dados pessoais e bloqueia a conta.
--    O login (auth.users) deve ser removido no painel do Supabase ou por
--    uma Edge Function com service_role.
-- ---------------------------------------------------------------------
create or replace function public.admin_anonymize_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'Apenas o dono da plataforma pode anonimizar contas.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Você não pode anonimizar a própria conta.' using errcode = 'P0001';
  end if;
  update public.profiles
     set full_name = 'Usuário removido',
         email = 'removido+' || left(p_user_id::text, 8) || '@servego.invalid',
         phone = null, avatar_url = null, city = null, state = null,
         status = 'blocked', anonymized_at = now(), updated_at = now()
   where id = p_user_id;
  delete from public.profile_private where user_id = p_user_id;
  update public.professionals set bio = null, headline = null, is_available = false where id = p_user_id;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'user.anonymized', 'profile', p_user_id, '{}'::jsonb);
end;
$$;
grant execute on function public.admin_anonymize_user(uuid) to authenticated;
