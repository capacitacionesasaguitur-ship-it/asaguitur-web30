-- Fase 4 · Panel de la Junta y comunicaciones. Ejecutar en Supabase → SQL Editor (después de fase3-extranet.sql).

-- ============ 1) Rol de administrador (Junta Directiva) ============
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,                                   -- ej. "Presidente", "Tesorero"
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;  -- sin políticas: nadie la lee desde el navegador
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid()) $$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Para nombrar a un directivo (debe tener usuario creado en Authentication):
--   insert into public.admins (user_id, note)
--   select id, 'Presidente' from auth.users where email = 'correo@dominio.com';

-- ============ 2) Bitácora de acciones de la Junta ============
create table if not exists public.admin_audit_log (
  id         bigint generated always as identity primary key,
  admin_id   uuid references auth.users(id) on delete set null,
  action     text not null,            -- ej. member.update, review.moderate, newsletter.send
  target     text,
  detail     jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;

-- ============ 3) Vistas solo para el servidor (service role) ============
create or replace view public.admin_members as
select g.id, g.full_name, g.carnet, g.email, g.active, g.valid_until, g.user_id,
       public.finance_status(g.valid_until) as finance_status
from public.guides g;

create or replace view public.admin_clicks as
select g.id as guide_id, g.full_name, g.carnet,
       count(c.id)::int as total,
       count(c.id) filter (where c.created_at > now() - interval '30 days')::int as last_30d,
       count(c.id) filter (where c.created_at > now() - interval '7 days')::int  as last_7d
from public.guides g left join public.whatsapp_clicks c on c.guide_id = g.id
group by g.id;

revoke all on public.admin_members, public.admin_clicks from anon, authenticated;
grant select on public.admin_members, public.admin_clicks to service_role;

-- Cierra la lectura pública de las métricas de clics creadas en schema.sql
revoke all on public.guide_click_stats from anon, authenticated;
grant select on public.guide_click_stats to service_role;

-- Enlaza al socio con su usuario de Auth si el correo ya existe (se usa al corregir un correo desde el panel)
create or replace function public.link_member_by_email(p_guide_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  select u.id into v_user from auth.users u join public.guides g on lower(g.email) = lower(u.email)
   where g.id = p_guide_id limit 1;
  if v_user is null then return false; end if;
  update public.guides set user_id = v_user where id = p_guide_id and user_id is distinct from v_user;
  return true;
end $$;
revoke all on function public.link_member_by_email(uuid) from public, anon, authenticated;
grant execute on function public.link_member_by_email(uuid) to service_role;

-- ============ 4) Recordatorios de pago: nuevo estado "invited" ============
-- Un pago "invited" es una cuota generada para un recordatorio por correo (estado histórico; la Fase 5 ya no lo usa).
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('invited', 'pending', 'paid', 'failed', 'cancelled'));

-- ============ 5) Comunicaciones (boletines y recordatorios) ============
create table if not exists public.newsletters (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('boletin', 'recordatorio')),
  subject          text not null,
  body             text not null,
  attachment_url   text,
  attachment_name  text,
  fingerprint      text,                             -- evita enviar dos veces el mismo mensaje por doble clic
  status           text not null default 'sending' check (status in ('sending', 'sent', 'partial', 'failed')),
  recipients_count int  not null default 0,
  sent_count       int  not null default 0,
  failed_count     int  not null default 0,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz
);
create index if not exists newsletters_fp_idx on public.newsletters (fingerprint, created_at desc);

create table if not exists public.newsletter_recipients (
  id            uuid primary key default gen_random_uuid(),
  newsletter_id uuid not null references public.newsletters(id) on delete cascade,
  guide_id      uuid references public.guides(id) on delete set null,
  email         text not null,
  payment_id    uuid references public.payments(id) on delete set null,   -- recordatorios: cuota enlazada
  status        text not null check (status in ('sent', 'failed')),
  resend_id     text,
  error         text
);
alter table public.newsletters           enable row level security;
alter table public.newsletter_recipients enable row level security;
revoke all on public.newsletters, public.newsletter_recipients from anon, authenticated;

-- ============ 6) Almacenamiento ============
-- Documentos: solo PDF, hasta 20 MB (la Junta los sube desde el panel)
update storage.buckets set file_size_limit = 20971520, allowed_mime_types = array['application/pdf'] where id = 'documents';

-- Adjuntos de boletines: público (el correo enlaza al archivo), nombres impredecibles (UUID), hasta 10 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boletin', 'boletin', true, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
