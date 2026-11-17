-- =====================================================================
-- ServeGo — 09_completion_confirmation.sql
-- Conclusão em duas etapas: o profissional conclui, o CLIENTE CONFIRMA.
--
--   in_progress ──(profissional)──▶ awaiting_confirmation
--   awaiting_confirmation ──(cliente confirma)──▶ completed  → repasse liberado
--   awaiting_confirmation ──(cliente: "tive um problema")──▶ disputed
--   disputed ──(admin)──▶ completed (libera ao profissional) ou cancelled (estorno)
--   awaiting_confirmation ──(sem resposta no prazo)──▶ completed (automático)
--
-- O pagamento continua retido até o status virar 'completed'; só então
-- on_booking_completed() gera a transação de repasse.
--
-- Rode DEPOIS de 01..08. É idempotente.
-- ATENÇÃO: como no 08, se o SQL Editor acusar "unsafe use of new value",
-- rode a seção 1 sozinha e depois o resto.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Novos status do serviço
-- ---------------------------------------------------------------------
alter type public.booking_status add value if not exists 'awaiting_confirmation';
alter type public.booking_status add value if not exists 'disputed';

-- ---------------------------------------------------------------------
-- 2. Colunas e configuração
-- ---------------------------------------------------------------------
alter table public.bookings
  add column if not exists pro_completed_at timestamptz,   -- quando o profissional marcou como concluído
  add column if not exists confirm_deadline timestamptz,   -- prazo para o cliente responder
  add column if not exists confirmed_at     timestamptz,
  add column if not exists confirmed_by     text check (confirmed_by in ('client','auto','admin'));

insert into public.app_settings (key, value) values ('completion_auto_confirm_hours', '24'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 3. Quem pode mudar o status, e para qual
--    SECURITY INVOKER: current_user é quem fez a alteração. As funções
--    abaixo (SECURITY DEFINER) e as Edge Functions passam direto.
-- ---------------------------------------------------------------------
create or replace function public.guard_booking_transitions()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  privileged boolean := auth.uid() is null
    or public.is_admin()
    or current_user in ('postgres', 'service_role', 'supabase_admin');
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if not privileged then
    if auth.uid() = old.professional_id then
      if not (
        (old.status = 'accepted'    and new.status = 'on_the_way') or
        (old.status = 'on_the_way'  and new.status = 'arrived') or
        (old.status = 'arrived'     and new.status = 'in_progress') or
        (old.status = 'in_progress' and new.status = 'awaiting_confirmation')
      ) then
        raise exception 'O profissional não pode mudar o serviço de % para %.', old.status, new.status
          using errcode = '42501';
      end if;
    else
      -- o cliente confirma ou contesta pelas funções confirm_completion / open_dispute
      raise exception 'Use as opções do app para confirmar ou contestar o serviço.' using errcode = '42501';
    end if;
  end if;

  if new.status = 'awaiting_confirmation' then
    new.pro_completed_at := now();
    new.confirm_deadline := now() + make_interval(hours => public.setting_num('completion_auto_confirm_hours', 24)::int);
    perform public.notify(new.client_id, 'status', 'O profissional concluiu o serviço',
      'Confirme se está tudo certo. Só então o pagamento é liberado a ele.', '#/acompanhar/' || new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bookings_a_transitions on public.bookings;
create trigger trg_bookings_a_transitions
  before update of status on public.bookings
  for each row execute function public.guard_booking_transitions();

-- ---------------------------------------------------------------------
-- 4. Cliente confirma a conclusão → libera o repasse
-- ---------------------------------------------------------------------
create or replace function public.confirm_completion(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  bk public.bookings;
begin
  select * into bk from public.bookings where id = p_booking_id for update;
  if bk.id is null or (bk.client_id <> auth.uid() and not public.is_admin()) then
    raise exception 'Serviço não encontrado.' using errcode = '42501';
  end if;
  if bk.status <> 'awaiting_confirmation' then
    raise exception 'Este serviço não está aguardando confirmação.' using errcode = 'P0001';
  end if;

  update public.bookings
     set status = 'completed', confirmed_at = now(),
         confirmed_by = case when public.is_admin() then 'admin' else 'client' end
   where id = bk.id
  returning * into bk;

  perform public.notify(bk.professional_id, 'booking', 'Cliente confirmou a conclusão',
    'O pagamento foi liberado para repasse.', '#/ganhos');
  return bk;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Cliente contesta ("tive um problema") → disputa, pagamento retido
-- ---------------------------------------------------------------------
create or replace function public.open_dispute(p_booking_id uuid, p_reason text, p_description text)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  bk public.bookings;
  rp public.reports;
  v_owner uuid;
begin
  select * into bk from public.bookings where id = p_booking_id for update;
  if bk.id is null or bk.client_id <> auth.uid() then
    raise exception 'Serviço não encontrado.' using errcode = '42501';
  end if;
  if bk.status not in ('awaiting_confirmation', 'in_progress', 'arrived') then
    raise exception 'Não é possível abrir disputa neste momento.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Informe o motivo.' using errcode = '22023';
  end if;

  update public.bookings set status = 'disputed' where id = bk.id;

  insert into public.reports (reporter_id, target_user_id, booking_id, reason, description, status)
  values (bk.client_id, bk.professional_id, bk.id, 'Disputa: ' || p_reason, p_description, 'open')
  returning * into rp;

  perform public.notify(bk.professional_id, 'status', 'O cliente abriu uma disputa',
    'O pagamento fica retido até a equipe ServeGo analisar o caso.', '#/servico/' || bk.id);

  select id into v_owner from public.profiles where role = 'admin' limit 1;
  perform public.notify(v_owner, 'status', 'Nova disputa para analisar', p_reason, '#/admin/denuncias');
  return rp;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Admin decide a disputa a favor do profissional (libera o repasse).
--    A favor do cliente = estorno, feito pela Edge Function refund-payment.
-- ---------------------------------------------------------------------
create or replace function public.resolve_dispute_release(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  bk public.bookings;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select * into bk from public.bookings where id = p_booking_id for update;
  if bk.status <> 'disputed' then
    raise exception 'Este serviço não está em disputa.' using errcode = 'P0001';
  end if;

  update public.bookings
     set status = 'completed', confirmed_at = now(), confirmed_by = 'admin'
   where id = bk.id
  returning * into bk;

  update public.reports set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
   where booking_id = bk.id and status in ('open', 'reviewing');

  perform public.notify(bk.client_id, 'status', 'Disputa encerrada',
    'Analisamos o caso e o serviço foi considerado concluído.', '#/acompanhar/' || bk.id);
  perform public.notify(bk.professional_id, 'booking', 'Disputa encerrada a seu favor',
    'O pagamento foi liberado para repasse.', '#/ganhos');
  return bk;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Confirmação automática quando o cliente não responde no prazo
--    Agende com pg_cron (Database → Extensions → pg_cron):
--      select cron.schedule('servego-auto-confirm', '*/10 * * * *',
--                           $$select public.auto_confirm_completions()$$);
--    O app também chama esta função ao abrir um serviço vencido.
-- ---------------------------------------------------------------------
create or replace function public.auto_confirm_completions()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  bk record;
  n  int := 0;
begin
  for bk in
    select id, client_id, professional_id from public.bookings
     where status = 'awaiting_confirmation' and confirm_deadline < now()
     for update skip locked
  loop
    update public.bookings
       set status = 'completed', confirmed_at = now(), confirmed_by = 'auto'
     where id = bk.id;
    perform public.notify(bk.professional_id, 'booking', 'Serviço confirmado automaticamente',
      'O prazo do cliente terminou e o pagamento foi liberado para repasse.', '#/ganhos');
    perform public.notify(bk.client_id, 'status', 'Serviço confirmado automaticamente',
      'Como não houve resposta no prazo, consideramos o serviço concluído.', '#/acompanhar/' || bk.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Fim do 09_completion_confirmation.sql
