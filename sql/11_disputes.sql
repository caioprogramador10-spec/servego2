-- =====================================================================
-- ServeGo — 11_disputes.sql
-- Disputas com PROVAS (fotos e vídeos) e análise pelo admin.
--
--   cliente clica "Tive um problema"  → envia motivo + fotos/vídeos (obrigatório)
--   profissional é avisado            → pode enviar a versão dele com provas
--   admin analisa                     → pode pedir mais provas a qualquer lado
--   admin decide (com justificativa)  → estorno ao cliente OU pagamento ao profissional
--
-- O pagamento continua retido (booking 'disputed') até a decisão.
-- Substitui o open_dispute / resolve_dispute_release do 09 (agora com provas).
--
-- Rode DEPOIS de 01..10. É idempotente.
-- =====================================================================

do $$ begin
  create type public.dispute_status as enum ('open','awaiting_info','resolved_refund','resolved_release');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.disputes (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null unique references public.bookings(id) on delete cascade,
  client_id        uuid not null references public.profiles(id),
  professional_id  uuid not null references public.profiles(id),
  amount           numeric(10,2) not null,              -- valor retido em análise
  reason           text not null,
  status           public.dispute_status not null default 'open',
  info_requested_from text check (info_requested_from in ('client','professional')),
  info_request     text,                                -- o que o admin pediu
  admin_notes      text,                                -- anotações internas (só admin)
  decision_reason  text,                                -- justificativa enviada às partes
  decided_by       uuid references public.profiles(id),
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_disputes_status on public.disputes (status, created_at desc);

-- Cada relato (cliente, profissional ou admin) com seus anexos
create table if not exists public.dispute_entries (
  id          uuid primary key default gen_random_uuid(),
  dispute_id  uuid not null references public.disputes(id) on delete cascade,
  author_id   uuid references public.profiles(id),
  party       text not null check (party in ('client','professional','admin')),
  note        text,
  attachments jsonb not null default '[]'::jsonb,   -- [{path, kind: image|video, mime, size}]
  created_at  timestamptz not null default now()
);
create index if not exists idx_dispute_entries on public.dispute_entries (dispute_id, created_at);

alter table public.disputes        enable row level security;
alter table public.dispute_entries enable row level security;

drop policy if exists "disputes_select_parties"  on public.disputes;
drop policy if exists "disputes_admin_all"       on public.disputes;
drop policy if exists "entries_select_parties"   on public.dispute_entries;
drop policy if exists "entries_admin_all"        on public.dispute_entries;

-- As partes veem o caso (sem as notas internas: o app nunca as pede para elas,
-- e a view abaixo é o que as partes usam).
create policy "disputes_select_parties"
  on public.disputes for select to authenticated
  using (client_id = auth.uid() or professional_id = auth.uid());

create policy "disputes_admin_all"
  on public.disputes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "entries_select_parties"
  on public.dispute_entries for select to authenticated
  using (exists (select 1 from public.disputes d
                  where d.id = dispute_id and (d.client_id = auth.uid() or d.professional_id = auth.uid())));

create policy "entries_admin_all"
  on public.dispute_entries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Notas internas nunca vão para cliente/profissional: a coluna sai do SELECT
-- (revogar só a coluna não basta quando a tabela inteira está liberada).
-- O app sempre lista as colunas; o admin lê as notas por dispute_admin_notes().
revoke select on public.disputes from anon, authenticated;
grant  select (id, booking_id, client_id, professional_id, amount, reason, status, info_requested_from,
               info_request, decision_reason, decided_by, decided_at, created_at, updated_at)
  on public.disputes to authenticated;

create or replace function public.dispute_set_notes(p_dispute_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  update public.disputes set admin_notes = p_notes, updated_at = now() where id = p_dispute_id;
end;
$$;

create or replace function public.dispute_admin_notes(p_dispute_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select admin_notes from public.disputes where id = p_dispute_id and public.is_admin();
$$;

-- ---------------------------------------------------------------------
-- 2. Bucket privado das provas
--    caminho: dispute-evidence/<uid de quem enviou>/<booking_id>/<arquivo>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dispute-evidence', 'dispute-evidence', false, 52428800,
        array['image/jpeg','image/png','image/webp','image/heic',
              'video/mp4','video/quicktime','video/webm','video/3gpp'])
on conflict (id) do nothing;

drop policy if exists "evidence_insert_own"     on storage.objects;
drop policy if exists "evidence_read_parties"   on storage.objects;
drop policy if exists "evidence_admin_all"      on storage.objects;

create policy "evidence_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dispute-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.bookings b
                 where b.id::text = (storage.foldername(name))[2]
                   and (b.client_id = auth.uid() or b.professional_id = auth.uid()))
  );

-- As duas partes e o admin veem as provas do caso
create policy "evidence_read_parties"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dispute-evidence'
    and exists (select 1 from public.bookings b
                 where b.id::text = (storage.foldername(name))[2]
                   and (b.client_id = auth.uid() or b.professional_id = auth.uid()))
  );

create policy "evidence_admin_all"
  on storage.objects for all to authenticated
  using (bucket_id = 'dispute-evidence' and public.is_admin())
  with check (bucket_id = 'dispute-evidence' and public.is_admin());

-- ---------------------------------------------------------------------
-- 3. Validação dos anexos: só caminhos do próprio usuário neste serviço
-- ---------------------------------------------------------------------
create or replace function public.valid_attachments(p_items jsonb, p_booking_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(bool_and(
           (a->>'path') like auth.uid()::text || '/' || p_booking_id::text || '/%'
           and (a->>'kind') in ('image','video')), true)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) a;
$$;

-- ---------------------------------------------------------------------
-- 4. Cliente abre a disputa (provas obrigatórias)
-- ---------------------------------------------------------------------
drop function if exists public.open_dispute(uuid, text, text);
create or replace function public.open_dispute(p_booking_id uuid, p_reason text, p_description text, p_attachments jsonb)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  bk public.bookings;
  d  public.disputes;
  v_owner uuid;
begin
  select * into bk from public.bookings where id = p_booking_id for update;
  if bk.id is null or bk.client_id <> auth.uid() then
    raise exception 'Serviço não encontrado.' using errcode = '42501';
  end if;
  if bk.status not in ('awaiting_confirmation', 'in_progress', 'arrived') then
    raise exception 'Não é possível abrir disputa neste momento.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_reason), '') = '' or length(coalesce(p_description, '')) < 10 then
    raise exception 'Informe o motivo e descreva o problema.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) < 1 then
    raise exception 'Envie ao menos uma foto ou vídeo do problema.' using errcode = '22023';
  end if;
  if not public.valid_attachments(p_attachments, bk.id) then
    raise exception 'Anexo inválido.' using errcode = '42501';
  end if;

  update public.bookings set status = 'disputed' where id = bk.id;

  insert into public.disputes (booking_id, client_id, professional_id, amount, reason)
  values (bk.id, bk.client_id, bk.professional_id, bk.price, p_reason)
  returning * into d;

  insert into public.dispute_entries (dispute_id, author_id, party, note, attachments)
  values (d.id, auth.uid(), 'client', p_description, p_attachments);

  perform public.notify(bk.professional_id, 'status', 'O cliente abriu uma disputa',
    'Envie sua versão com fotos ou vídeos. O pagamento fica retido até a análise.', '#/servico/' || bk.id);
  select id into v_owner from public.profiles where role = 'admin' limit 1;
  perform public.notify(v_owner, 'status', 'Nova disputa para analisar', p_reason, '#/admin/disputas/' || d.id);
  return d;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Cliente ou profissional enviam relato/provas
-- ---------------------------------------------------------------------
create or replace function public.add_dispute_entry(p_dispute_id uuid, p_note text, p_attachments jsonb)
returns public.dispute_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  d  public.disputes;
  e  public.dispute_entries;
  v_party text;
  v_owner uuid;
begin
  select * into d from public.disputes where id = p_dispute_id for update;
  if d.id is null then raise exception 'Disputa não encontrada.' using errcode = 'P0002'; end if;
  v_party := case when auth.uid() = d.client_id then 'client'
                  when auth.uid() = d.professional_id then 'professional' end;
  if v_party is null then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  if d.status not in ('open', 'awaiting_info') then
    raise exception 'Esta disputa já foi decidida.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_note), '') = '' and jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) = 0 then
    raise exception 'Escreva um relato ou anexe provas.' using errcode = '22023';
  end if;
  if not public.valid_attachments(p_attachments, d.booking_id) then
    raise exception 'Anexo inválido.' using errcode = '42501';
  end if;

  insert into public.dispute_entries (dispute_id, author_id, party, note, attachments)
  values (d.id, auth.uid(), v_party, p_note, coalesce(p_attachments, '[]'::jsonb))
  returning * into e;

  -- respondeu o que o admin pediu → volta para a fila de análise
  if d.status = 'awaiting_info' and d.info_requested_from = v_party then
    update public.disputes set status = 'open', info_requested_from = null, info_request = null, updated_at = now()
     where id = d.id;
  else
    update public.disputes set updated_at = now() where id = d.id;
  end if;

  select id into v_owner from public.profiles where role = 'admin' limit 1;
  perform public.notify(v_owner, 'status', 'Nova prova em disputa',
    case v_party when 'client' then 'O cliente' else 'O profissional' end || ' enviou informações.',
    '#/admin/disputas/' || d.id);
  return e;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Admin pede mais informações a uma das partes
-- ---------------------------------------------------------------------
create or replace function public.dispute_request_info(p_dispute_id uuid, p_party text, p_message text)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.disputes;
begin
  if not public.is_admin() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  if p_party not in ('client','professional') or coalesce(trim(p_message), '') = '' then
    raise exception 'Informe a parte e o que precisa.' using errcode = '22023';
  end if;
  update public.disputes
     set status = 'awaiting_info', info_requested_from = p_party, info_request = p_message, updated_at = now()
   where id = p_dispute_id and status in ('open','awaiting_info')
  returning * into d;
  if d.id is null then raise exception 'Disputa não encontrada ou já decidida.' using errcode = 'P0001'; end if;

  insert into public.dispute_entries (dispute_id, author_id, party, note)
  values (d.id, auth.uid(), 'admin', 'Pedido de informações: ' || p_message);

  perform public.notify(case p_party when 'client' then d.client_id else d.professional_id end,
    'status', 'A equipe ServeGo precisa de mais informações', p_message, '#/inicio');
  return d;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Decisão: pagar o profissional (o estorno sai pela Edge Function
--    refund-payment, que também fecha a disputa como resolved_refund)
-- ---------------------------------------------------------------------
drop function if exists public.resolve_dispute_release(uuid);
create or replace function public.resolve_dispute_release(p_booking_id uuid, p_reason text)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  bk public.bookings;
begin
  if not public.is_admin() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Escreva a justificativa da decisão.' using errcode = '22023';
  end if;
  select * into bk from public.bookings where id = p_booking_id for update;
  if bk.status <> 'disputed' then raise exception 'Este serviço não está em disputa.' using errcode = 'P0001'; end if;

  update public.bookings set status = 'completed', confirmed_at = now(), confirmed_by = 'admin'
   where id = bk.id returning * into bk;

  update public.disputes
     set status = 'resolved_release', decision_reason = p_reason, decided_by = auth.uid(),
         decided_at = now(), updated_at = now()
   where booking_id = bk.id;

  perform public.notify(bk.client_id, 'status', 'Disputa decidida',
    'O pagamento foi liberado ao profissional. Motivo: ' || p_reason, '#/acompanhar/' || bk.id);
  perform public.notify(bk.professional_id, 'booking', 'Disputa decidida a seu favor',
    'O pagamento foi liberado para repasse. ' || p_reason, '#/ganhos');
  return bk;
end;
$$;

-- Fim do 11_disputes.sql
