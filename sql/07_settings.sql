-- =====================================================================
-- ServeGo — 07_settings.sql
-- Configurações da plataforma editáveis pelo painel admin.
--
--   • app_settings: chave/valor (hoje: platform_fee_percent)
--   • platform_fee_percent(): taxa vigente (padrão 10%)
--   • on_booking_completed() passa a usar a taxa vigente em vez de 10% fixo
--   • platform_fee_history: histórico de cada alteração da taxa
--
-- A taxa vale para serviços concluídos A PARTIR da alteração; transações
-- já geradas mantêm o percentual da época (o valor fica gravado nelas).
--
-- Rode DEPOIS de 01..06. É idempotente.
-- =====================================================================

create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);
comment on table public.app_settings is 'Configurações globais do ServeGo, editáveis pelo admin.';

insert into public.app_settings (key, value)
values ('platform_fee_percent', '10'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "settings_read_all"   on public.app_settings;
drop policy if exists "settings_admin_all"  on public.app_settings;

-- Todos leem (o cliente e o profissional veem a taxa no app).
create policy "settings_read_all"
  on public.app_settings for select
  to anon, authenticated
  using (true);

create policy "settings_admin_all"
  on public.app_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Taxa sempre entre 0% e 50%.
create or replace function public.validate_app_settings()
returns trigger
language plpgsql
as $$
declare
  v numeric;
begin
  if new.key = 'platform_fee_percent' then
    begin
      v := (new.value #>> '{}')::numeric;
    exception when others then
      raise exception 'Taxa inválida.' using errcode = '22023';
    end;
    if v < 0 or v > 50 then
      raise exception 'A taxa da plataforma deve ficar entre 0%% e 50%%.' using errcode = '22023';
    end if;
    new.value := to_jsonb(round(v, 2));
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_app_settings_validate on public.app_settings;
create trigger trg_app_settings_validate
  before insert or update on public.app_settings
  for each row execute function public.validate_app_settings();

-- Histórico das alterações de taxa ------------------------------------
create table if not exists public.platform_fee_history (
  id           uuid primary key default gen_random_uuid(),
  old_percent  numeric(5,2),
  new_percent  numeric(5,2) not null,
  changed_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.platform_fee_history enable row level security;
drop policy if exists "fee_history_admin_select" on public.platform_fee_history;
create policy "fee_history_admin_select"
  on public.platform_fee_history for select
  to authenticated
  using (public.is_admin());

create or replace function public.log_fee_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.key = 'platform_fee_percent'
     and (tg_op = 'INSERT' or new.value is distinct from old.value) then
    insert into public.platform_fee_history (old_percent, new_percent, changed_by)
    values (
      case when tg_op = 'UPDATE' then (old.value #>> '{}')::numeric end,
      (new.value #>> '{}')::numeric,
      auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_app_settings_fee_history on public.app_settings;
create trigger trg_app_settings_fee_history
  after insert or update on public.app_settings
  for each row execute function public.log_fee_change();

-- Taxa vigente ---------------------------------------------------------
create or replace function public.platform_fee_percent()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (value #>> '{}')::numeric from public.app_settings where key = 'platform_fee_percent'),
    10
  );
$$;

-- Ciclo de vida do booking com a taxa configurável ---------------------
-- (mesma função do 01_schema.sql; só o cálculo da taxa mudou)
create or replace function public.on_booking_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee numeric(10,2);
  v_net numeric(10,2);
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'in_progress' and new.started_at is null then
    new.started_at := now();
  elsif new.status = 'arrived' and new.arrived_at is null then
    new.arrived_at := now();
  elsif new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at := now();
  end if;

  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at := coalesce(new.completed_at, now());

    update public.professionals
    set jobs_count = jobs_count + 1,
        updated_at = now()
    where id = new.professional_id;

    update public.service_requests
    set status = 'completed',
        updated_at = now()
    where id = new.request_id;

    -- lançamento financeiro com a taxa vigente (app_settings)
    v_fee := round(coalesce(new.price, 0) * public.platform_fee_percent() / 100, 2);
    v_net := round(coalesce(new.price, 0) - v_fee, 2);

    insert into public.transactions (booking_id, professional_id, client_id, amount, platform_fee, net_amount, status)
    values (new.id, new.professional_id, new.client_id, coalesce(new.price, 0), v_fee, v_net, 'pending');

    perform public.notify(
      new.client_id,
      'booking_completed',
      'Serviço concluído',
      'O profissional finalizou o atendimento. Que tal avaliar o serviço?',
      '/avaliar/' || new.id::text
    );
  end if;

  return new;
end;
$$;
comment on function public.on_booking_completed() is
  'Carimba timestamps do booking e, ao concluir, incrementa jobs_count, fecha a solicitação, gera a transação (taxa de app_settings) e notifica o cliente.';

-- Fim do 07_settings.sql
