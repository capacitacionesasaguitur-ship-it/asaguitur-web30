-- Fase 3 · Extranet del socio. Ejecutar en Supabase → SQL Editor (una sola vez, después de fase2-carnet.sql).

-- ============ 1) Vincular socios con usuarios de Supabase Auth ============
alter table public.guides
  add column if not exists user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists email   text;                       -- correo personal del socio (privado)
create unique index if not exists guides_email_lower_idx on public.guides (lower(email));

-- Cuando se invita/crea un usuario, se enlaza solo con el socio que tenga ese correo
create or replace function public.link_member_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.guides set user_id = new.id where lower(email) = lower(new.email) and user_id is null;
  return new;
end $$;
drop trigger if exists trg_link_member on auth.users;
create trigger trg_link_member after insert on auth.users for each row execute function public.link_member_on_signup();

-- Usuarios que ya existían
update public.guides g set user_id = u.id from auth.users u where lower(g.email) = lower(u.email) and g.user_id is null;

-- ============ 2) Datos privados fuera del alcance público ============
-- Con las nuevas columnas (email, user_id) ya no se puede dejar "select *" abierto a anon.
revoke select, insert, update, delete on public.guides from anon, authenticated;
grant select (id, full_name, carnet, rnt, photo_url, languages, specialties, department,
              whatsapp, bio, active, created_at, member_since, valid_until)
  on public.guides to anon, authenticated;

-- ============ 3) Funciones auxiliares ============
create or replace function public.my_guide_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.guides where user_id = auth.uid() $$;

create or replace function public.is_active_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.guides where user_id = auth.uid() and active) $$;

-- Estado financiero a partir de la fecha de vencimiento (ajusta los 30 días si la Junta lo decide)
--   al_dia   : vence dentro de más de 30 días
--   pendiente: vence en los próximos 30 días, o venció hace 30 días o menos
--   en_mora  : venció hace más de 30 días
create or replace function public.finance_status(p_valid_until date) returns text
language sql stable as $$
  select case
    when p_valid_until is null                      then 'pendiente'
    when p_valid_until <  current_date - 30         then 'en_mora'
    when p_valid_until <  current_date + 30         then 'pendiente'
    else 'al_dia' end $$;

-- Perfil completo del propio socio (incluye correo y estado financiero)
create or replace function public.member_overview()
returns table (id uuid, full_name text, carnet text, rnt text, photo_url text, languages text[], specialties text[],
               department text, whatsapp text, bio text, active boolean, member_since date, valid_until date,
               finance_status text, email text)
language sql stable security definer set search_path = public as $$
  select g.id, g.full_name, g.carnet, g.rnt, g.photo_url, g.languages, g.specialties, g.department,
         g.whatsapp, g.bio, g.active, g.member_since, g.valid_until, public.finance_status(g.valid_until), g.email
  from public.guides g where g.user_id = auth.uid() $$;

-- El socio solo puede cambiar estos 4 campos de su perfil (la foto la sube el servidor)
create or replace function public.update_my_profile(p_bio text, p_languages text[], p_specialties text[], p_whatsapp text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if char_length(coalesce(p_bio, '')) > 1000 then raise exception 'bio_larga'; end if;
  if p_whatsapp !~ '^[0-9]{8,15}$' then raise exception 'whatsapp_invalido'; end if;
  if coalesce(array_length(p_languages, 1), 0)   not between 1 and 12 then raise exception 'idiomas_invalidos'; end if;
  if coalesce(array_length(p_specialties, 1), 0) not between 1 and 12 then raise exception 'especialidades_invalidas'; end if;
  update public.guides
     set bio = nullif(trim(p_bio), ''), languages = p_languages, specialties = p_specialties, whatsapp = p_whatsapp
   where user_id = auth.uid();
  if not found then raise exception 'sin_perfil'; end if;
end $$;

-- ============ 4) Eventos y capacitaciones ============
create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  summary       text,
  agenda        text,                                   -- temario
  speaker       text,                                   -- ponente
  location      text,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  capacity      int  not null check (capacity > 0),     -- cupos
  price_member  numeric(10,2) not null default 0 check (price_member >= 0),  -- 0 = gratis
  published     boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ============ 5) Pagos (cuotas e inscripciones) ============
create table if not exists public.payments (
  id                    uuid primary key default gen_random_uuid(),
  guide_id              uuid not null references public.guides(id) on delete cascade,
  concept               text not null check (concept in ('cuota', 'evento')),
  event_id              uuid references public.events(id) on delete set null,
  description           text not null,
  amount                numeric(10,2) not null check (amount > 0),
  currency              text not null default 'USD',
  status                text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  months_covered        int,                                          -- cuotas: meses que suma a la vigencia
  paid_at               timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists payments_guide_idx on public.payments (guide_id, created_at desc);

create table if not exists public.event_registrations (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  guide_id      uuid not null references public.guides(id) on delete cascade,
  payment_id    uuid references public.payments(id) on delete set null,
  status        text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz,
  unique (event_id, guide_id)
);

-- Eventos publicados con cupos restantes (cuenta confirmados + reservas pendientes de menos de 60 min).
-- Solo los ve un socio ACTIVO con sesión iniciada.
create or replace view public.events_with_seats as
select e.*, greatest(e.capacity - coalesce(r.taken, 0), 0) as seats_left
from public.events e
left join lateral (
  select count(*)::int as taken from public.event_registrations er
  where er.event_id = e.id
    and (er.status = 'confirmed' or (er.status = 'pending' and er.created_at > now() - interval '60 minutes'))
) r on true
where e.published and public.is_active_member();

-- ============ 6) Biblioteca digital ============
create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  category    text not null check (category in ('leyes', 'sitios', 'mapas_manuales')),
  keywords    text,                                      -- palabras clave para el buscador
  file_path   text not null,                             -- ruta dentro del bucket privado "documents"
  file_size   bigint,                                    -- bytes
  published   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ============ 7) Seguridad (RLS) ============
alter table public.events              enable row level security;   -- sin políticas: solo vía vista/funciones
alter table public.payments            enable row level security;
alter table public.event_registrations enable row level security;
alter table public.documents           enable row level security;

create policy "socio ve sus pagos"          on public.payments            for select to authenticated using (guide_id = public.my_guide_id());
create policy "socio ve sus inscripciones"  on public.event_registrations for select to authenticated using (guide_id = public.my_guide_id());
create policy "socio activo ve documentos"  on public.documents           for select to authenticated using (published and public.is_active_member());

revoke all on public.events, public.payments, public.event_registrations, public.documents from anon, authenticated;
grant select on public.payments, public.event_registrations, public.documents to authenticated;
revoke all on public.events_with_seats from anon;
grant select on public.events_with_seats to authenticated;

revoke all on function public.my_guide_id(), public.is_active_member(), public.member_overview(),
              public.update_my_profile(text, text[], text[], text) from public, anon;
grant execute on function public.my_guide_id(), public.is_active_member(), public.member_overview(),
              public.update_my_profile(text, text[], text[], text) to authenticated;

-- ============ 8) Pagos e inscripciones ============
-- Los pagos los registra la Tesorería (Fase 5); las funciones de pago y de inscripción se crean en fase5-cuotas-manuales.sql.

-- ============ 9) Almacenamiento de archivos ============
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)   on conflict (id) do nothing;  -- fotos de perfil (públicas)
insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing; -- biblioteca (privado)
