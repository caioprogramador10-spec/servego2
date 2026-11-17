-- =====================================================================
-- ServeGo — 06_identity.sql
-- Verificação de identidade obrigatória no cadastro + recursos do admin.
--
--   • CPF e data de nascimento em tabela PRIVADA (profile_private) — a
--     tabela profiles é parcialmente pública (perfil do profissional)
--   • identity_verifications: documento (frente e verso) + selfie
--   • bucket privado identity-documents
--   • profiles.identity_status sincronizado por gatilho (o usuário nunca
--     consegue se auto-aprovar)
--   • só quem tem identidade aprovada cria solicitações / orçamentos
--   • admin_audit_log (trilha de auditoria) e admin_broadcast (comunicados)
--   • admin_metrics() ampliado
--
-- Rode DEPOIS de 01..05. É idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Status de identidade no perfil
-- ---------------------------------------------------------------------
do $$ begin
  create type public.identity_status as enum ('not_submitted','pending','approved','rejected');
exception when duplicate_object then null; end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'identity_status'
  ) then
    alter table public.profiles
      add column identity_status public.identity_status not null default 'not_submitted';
    -- contas que já existiam antes da verificação obrigatória não ficam travadas
    update public.profiles set identity_status = 'approved';
  end if;
end $$;

comment on column public.profiles.identity_status is
  'Situação da verificação de identidade. Alterada apenas por gatilhos ou pelo admin.';

-- ---------------------------------------------------------------------
-- 2. Dados pessoais sensíveis (somente dono + admin)
-- ---------------------------------------------------------------------
create table if not exists public.profile_private (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  cpf         text unique check (cpf ~ '^[0-9]{11}$'),   -- só dígitos
  birth_date  date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profile_private is 'CPF e data de nascimento. Nunca exposto a outros usuários.';

alter table public.profile_private enable row level security;

drop policy if exists "profile_private_select_own" on public.profile_private;
drop policy if exists "profile_private_admin_all"  on public.profile_private;

create policy "profile_private_select_own"
  on public.profile_private for select
  to authenticated
  using (user_id = auth.uid());

-- Sem policy de insert/update para o usuário: o CPF é gravado no signup pelo
-- gatilho e só o admin corrige depois.
create policy "profile_private_admin_all"
  on public.profile_private for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Validação de CPF (dígitos verificadores) -----------------------------
create or replace function public.cpf_is_valid(p_cpf text)
returns boolean
language plpgsql
immutable
as $$
declare
  d   text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  s   int;
  i   int;
  dv1 int;
  dv2 int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then
    return false;
  end if;
  s := 0;
  for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  dv1 := (s * 10) % 11; if dv1 = 10 then dv1 := 0; end if;
  s := 0;
  for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  dv2 := (s * 10) % 11; if dv2 = 10 then dv2 := 0; end if;
  return dv1 = substr(d, 10, 1)::int and dv2 = substr(d, 11, 1)::int;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Signup: grava também CPF e nascimento
--    (substitui a versão do 01_schema.sql mantendo o mesmo comportamento)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  public.user_role;
  v_cpf   text := regexp_replace(coalesce(new.raw_user_meta_data->>'cpf', ''), '\D', '', 'g');
  v_birth date;
begin
  begin
    v_role := coalesce(nullif(new.raw_user_meta_data->>'role',''), 'client')::public.user_role;
  exception when others then
    v_role := 'client';
  end;

  begin
    v_birth := nullif(new.raw_user_meta_data->>'birth_date','')::date;
  exception when others then
    v_birth := null;
  end;

  insert into public.profiles (id, full_name, email, phone, avatar_url, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'full_name',''),
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'phone',''), new.phone),
    nullif(new.raw_user_meta_data->>'avatar_url',''),
    v_role
  )
  on conflict (id) do nothing;

  if v_cpf <> '' then
    if not public.cpf_is_valid(v_cpf) then
      raise exception 'CPF inválido.' using errcode = '22023';
    end if;
    -- unique(cpf) barra a segunda conta com o mesmo CPF
    insert into public.profile_private (user_id, cpf, birth_date)
    values (new.id, v_cpf, v_birth)
    on conflict (user_id) do nothing;
  end if;

  if v_role = 'professional' then
    insert into public.professionals (id)
    values (new.id)
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

-- O dono (admin) nunca precisa passar pela verificação.
create or replace function public.owner_identity_approved()
returns trigger
language plpgsql
as $$
begin
  if lower(coalesce(new.email, '')) = public.servego_owner_email() then
    new.identity_status := 'approved';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_owner_identity on public.profiles;
create trigger trg_profiles_owner_identity
  before insert on public.profiles
  for each row execute function public.owner_identity_approved();

update public.profiles set identity_status = 'approved'
 where lower(coalesce(email, '')) = public.servego_owner_email();

-- ---------------------------------------------------------------------
-- 4. Envios de verificação
-- ---------------------------------------------------------------------
create table if not exists public.identity_verifications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  doc_type         text not null check (doc_type in ('rg','cnh','rne')),
  front_path       text not null,     -- identity-documents/<uid>/...-front.jpg
  back_path        text not null,
  selfie_path      text not null,
  status           public.doc_status not null default 'pending',
  rejection_reason text,
  reviewed_by      uuid references public.profiles(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);
comment on table public.identity_verifications is
  'Documento com foto (frente e verso) e selfie enviados no cadastro. Bucket privado.';

create index if not exists idx_identity_user   on public.identity_verifications (user_id, created_at desc);
create index if not exists idx_identity_status on public.identity_verifications (status, created_at desc);

alter table public.identity_verifications enable row level security;

drop policy if exists "identity_select_own" on public.identity_verifications;
drop policy if exists "identity_insert_own" on public.identity_verifications;
drop policy if exists "identity_admin_all"  on public.identity_verifications;

create policy "identity_select_own"
  on public.identity_verifications for select
  to authenticated
  using (user_id = auth.uid());

-- O usuário só envia para si, sempre como "pending", e só se não estiver
-- aprovado nem com outro envio aguardando análise.
create policy "identity_insert_own"
  on public.identity_verifications for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.identity_status in ('not_submitted','rejected')
    )
  );

create policy "identity_admin_all"
  on public.identity_verifications for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 5. Sincronização profile.identity_status + blindagem
-- ---------------------------------------------------------------------
create or replace function public.sync_identity_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('servego.identity_sync', 'on', true);

  if tg_op = 'INSERT' then
    update public.profiles set identity_status = 'pending' where id = new.user_id;
  elsif new.status is distinct from old.status then
    update public.profiles set identity_status = new.status::text::public.identity_status
     where id = new.user_id;

    if new.status = 'approved' then
      perform public.notify(new.user_id, 'verification', 'Identidade verificada',
        'Seu cadastro foi liberado. Bem-vindo ao ServeGo!', '#/inicio');
    elsif new.status = 'rejected' then
      perform public.notify(new.user_id, 'verification', 'Verificação de identidade recusada',
        coalesce(new.rejection_reason, 'Envie novas fotos do documento e da selfie.'), '#/inicio');
    end if;
  end if;

  perform set_config('servego.identity_sync', 'off', true);
  return new;
end;
$$;

drop trigger if exists trg_identity_sync on public.identity_verifications;
create trigger trg_identity_sync
  after insert or update of status on public.identity_verifications
  for each row execute function public.sync_identity_status();

-- Ninguém além do admin (ou do gatilho acima) altera identity_status.
create or replace function public.guard_identity_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.identity_status is distinct from old.identity_status
     and coalesce(current_setting('servego.identity_sync', true), 'off') <> 'on'
     and not public.is_admin()
     and auth.uid() is not null then
    raise exception 'O status de identidade só pode ser alterado pela equipe ServeGo.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_identity on public.profiles;
create trigger trg_profiles_guard_identity
  before update of identity_status on public.profiles
  for each row execute function public.guard_identity_status();

create or replace function public.identity_approved(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.identity_status = 'approved');
$$;

-- Policies RESTRITIVAS: somam-se às existentes (AND). Sem identidade
-- aprovada não se cria solicitação nem se envia orçamento.
drop policy if exists "requests_require_identity" on public.service_requests;
create policy "requests_require_identity"
  on public.service_requests as restrictive for insert
  to authenticated
  with check (public.identity_approved() or public.is_admin());

drop policy if exists "offers_require_identity" on public.service_offers;
create policy "offers_require_identity"
  on public.service_offers as restrictive for insert
  to authenticated
  with check (public.identity_approved() or public.is_admin());

-- ---------------------------------------------------------------------
-- 6. Bucket privado identity-documents
--    caminho: identity-documents/<auth.uid()>/<arquivo>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('identity-documents', 'identity-documents', false, 10485760,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "identity_docs_insert_own"  on storage.objects;
drop policy if exists "identity_docs_read_own"    on storage.objects;
drop policy if exists "identity_docs_read_admin"  on storage.objects;
drop policy if exists "identity_docs_delete_admin" on storage.objects;

create policy "identity_docs_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "identity_docs_read_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "identity_docs_read_admin"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'identity-documents' and public.is_admin());

-- Só o admin apaga (ex.: atender pedido de exclusão de dados — LGPD).
create policy "identity_docs_delete_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'identity-documents' and public.is_admin());

-- ---------------------------------------------------------------------
-- 7. Trilha de auditoria do admin
-- ---------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid references public.profiles(id) on delete set null,
  action       text not null,        -- ex.: identity.approved, user.blocked
  target_type  text,                 -- profile | report | transaction | broadcast
  target_id    uuid,
  details      jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_audit_created on public.admin_audit_log (created_at desc);
create index if not exists idx_audit_target  on public.admin_audit_log (target_id);

alter table public.admin_audit_log enable row level security;

drop policy if exists "audit_admin_select" on public.admin_audit_log;
drop policy if exists "audit_admin_insert" on public.admin_audit_log;

create policy "audit_admin_select"
  on public.admin_audit_log for select
  to authenticated
  using (public.is_admin());

-- Só inserção: o histórico não pode ser editado nem apagado pelo app.
create policy "audit_admin_insert"
  on public.admin_audit_log for insert
  to authenticated
  with check (public.is_admin() and admin_id = auth.uid());

-- ---------------------------------------------------------------------
-- 8. Comunicados (notificação em massa)
-- ---------------------------------------------------------------------
create or replace function public.admin_broadcast(p_audience text, p_title text, p_body text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_audience not in ('all','client','professional') then
    raise exception 'Público inválido.' using errcode = '22023';
  end if;

  insert into public.notifications (user_id, type, title, body, link)
  select p.id, 'broadcast', p_title, p_body, '#/inicio'
    from public.profiles p
   where p.role <> 'admin'
     and p.status = 'active'
     and (p_audience = 'all' or p.role::text = p_audience);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Métricas ampliadas
-- ---------------------------------------------------------------------
create or replace function public.admin_metrics()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado: somente administradores podem consultar as métricas.'
      using errcode = '42501';
  end if;

  select json_build_object(
    'total_usuarios',           (select count(*) from public.profiles),
    'total_clientes',           (select count(*) from public.profiles where role = 'client'),
    'total_profissionais',      (select count(*) from public.professionals),
    'profissionais_pendentes',  (select count(*) from public.professionals where verification_status = 'pending'),
    'identidades_pendentes',    (select count(*) from public.identity_verifications where status = 'pending'),
    'usuarios_bloqueados',      (select count(*) from public.profiles where status = 'blocked'),
    'novos_usuarios_7d',        (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'denuncias_abertas',        (select count(*) from public.reports where status in ('open','reviewing')),
    'total_solicitacoes',       (select count(*) from public.service_requests),
    'solicitacoes_abertas',     (select count(*) from public.service_requests where status in ('open','matching')),
    'servicos_concluidos',      (select count(*) from public.bookings where status = 'completed'),
    'volume_transacionado',     (select coalesce(sum(amount), 0)       from public.transactions where status <> 'refunded'),
    'receita_plataforma',       (select coalesce(sum(platform_fee), 0) from public.transactions where status = 'released'),
    'receita_prevista',         (select coalesce(sum(platform_fee), 0) from public.transactions where status = 'pending'),
    'taxa_conclusao',           (
      select case when count(*) = 0 then 0
             else round(100.0 * count(*) filter (where status = 'completed') / count(*), 2)
             end
      from public.bookings
    ),
    'gerado_em', now()
  ) into v_result;

  return v_result;
end;
$$;

-- Fim do 06_identity.sql
