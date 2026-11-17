-- =====================================================================
-- ServeGo — 13_staff_accounts.sql
-- Contas da equipe criadas pelo painel (Admin → Equipe de suporte).
--
-- O login é criado pela Edge Function admin-create-user (service_role).
-- Este arquivo libera esse caminho sem abrir brechas:
--   • staff_invites: e-mails autorizados pelo dono a entrar na equipe
--     (vale mesmo com "cadastros fechados");
--   • enforce_admin_role aceita a promoção feita pela service_role;
--   • profiles.invited_at / invited_by: quem convidou e quando.
--
-- Rode DEPOIS de 12_admin_control.sql. É idempotente.
-- =====================================================================

alter table public.profiles add column if not exists invited_at timestamptz;
alter table public.profiles add column if not exists invited_by uuid references public.profiles(id) on delete set null;

create table if not exists public.staff_invites (
  email       text primary key,
  admin_role  text not null check (admin_role in ('finance', 'moderation', 'support', 'ops')),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.staff_invites enable row level security;
drop policy if exists "staff_invites_owner_all" on public.staff_invites;
create policy "staff_invites_owner_all"
  on public.staff_invites for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- Cadastros fechados não barram quem foi convidado pelo dono.
create or replace function public.guard_signups_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'signups_open'), true) = false
     and new.role <> 'admin'
     and not exists (select 1 from public.staff_invites i where lower(i.email) = lower(new.email)) then
    raise exception 'Os cadastros estão temporariamente fechados.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Promoção a admin: dono pelo painel OU a Edge Function (service_role)
-- para um e-mail convidado em staff_invites.
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
      return new;
    end if;
    if auth.uid() is not null and public.is_owner(auth.uid()) then
      return new;
    end if;
    if coalesce(auth.role(), '') = 'service_role'
       and exists (select 1 from public.staff_invites i where lower(i.email) = lower(new.email)) then
      return new;
    end if;
    raise exception 'Somente o dono da plataforma pode adicionar alguém à equipe.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
