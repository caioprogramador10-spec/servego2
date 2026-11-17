-- =====================================================================
-- ServeGo — 10_engagement.sql
-- Reengajamento: saber quem não usa o app há tempo e lembrar essa pessoa.
--
--   • profiles.last_seen_at     último acesso (o app registra ao abrir)
--   • profiles.last_reminded_at último lembrete enviado (evita insistir demais)
--   • touch_last_seen()         chamada pelo app; só grava a hora do servidor
--   • admin_send_reminder()     notificação no app + marca o lembrete
--     (o e-mail sai pela Edge Function send-reminder)
--
-- Rode DEPOIS de 01..09. É idempotente.
-- =====================================================================

alter table public.profiles
  add column if not exists last_seen_at     timestamptz,
  add column if not exists last_reminded_at timestamptz;

create index if not exists idx_profiles_last_seen on public.profiles (last_seen_at);

-- Quem já existia: usa o último login do Supabase Auth (ou a data de cadastro)
update public.profiles p
   set last_seen_at = coalesce(u.last_sign_in_at, p.created_at)
  from auth.users u
 where u.id = p.id and p.last_seen_at is null;

-- O app chama ao abrir. Grava no máximo a cada 10 minutos e sempre com a
-- hora do servidor (o usuário não consegue "fingir" atividade em outra data).
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set last_seen_at = now()
   where id = auth.uid()
     and (last_seen_at is null or last_seen_at < now() - interval '10 minutes');
$$;

-- Lembrete em massa (somente admin). Personaliza {nome} com o primeiro nome.
create or replace function public.admin_send_reminder(p_user_ids uuid[], p_title text, p_body text)
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
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then
    raise exception 'Informe título e mensagem.' using errcode = '22023';
  end if;

  insert into public.notifications (user_id, type, title, body, link)
  select p.id, 'reminder',
         replace(p_title, '{nome}', split_part(coalesce(p.full_name, ''), ' ', 1)),
         replace(p_body,  '{nome}', split_part(coalesce(p.full_name, ''), ' ', 1)),
         '#/inicio'
    from public.profiles p
   where p.id = any(p_user_ids)
     and p.role <> 'admin'
     and p.status = 'active';
  get diagnostics v_count = row_count;

  update public.profiles set last_reminded_at = now()
   where id = any(p_user_ids) and role <> 'admin' and status = 'active';

  return v_count;
end;
$$;

-- Fim do 10_engagement.sql
