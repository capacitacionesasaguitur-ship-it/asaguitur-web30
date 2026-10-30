-- Fase 2 · Carné digital. Ejecutar en Supabase → SQL Editor (una sola vez).

-- 1) Fechas del carné
alter table public.guides
  add column if not exists member_since date,
  add column if not exists valid_until  date;   -- fecha de vencimiento de la vigencia

-- 2) Verificación pública: lee DIRECTO de public.guides, incluso si el socio está inactivo,
--    pero entrega solo lo necesario. Si está inactivo, oculta nombre, foto, RNT y departamento.
create or replace function public.verify_carnet(p_id uuid)
returns table (id uuid, full_name text, carnet text, rnt text, photo_url text,
               department text, active boolean, member_since date, valid_until date)
language sql stable security definer set search_path = public as $$
  select g.id,
         case when g.active then g.full_name  end,
         g.carnet,
         case when g.active then g.rnt        end,
         case when g.active then g.photo_url  end,
         case when g.active then g.department end,
         g.active, g.member_since, g.valid_until
  from public.guides g
  where g.id = p_id;
$$;
revoke all on function public.verify_carnet(uuid) from public;
grant execute on function public.verify_carnet(uuid) to anon, authenticated;

-- 3) Bitácora: quién/cuándo cambió el estado de un socio (alta o baja)
create table if not exists public.guide_status_log (
  id         bigint generated always as identity primary key,
  guide_id   uuid not null references public.guides(id) on delete cascade,
  old_active boolean,
  new_active boolean,
  changed_at timestamptz not null default now()
);
alter table public.guide_status_log enable row level security;  -- sin políticas: solo la Junta, desde el panel

create or replace function public.log_guide_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.active is distinct from old.active then
    insert into public.guide_status_log (guide_id, old_active, new_active) values (new.id, old.active, new.active);
  end if;
  return new;
end $$;

drop trigger if exists trg_guide_status on public.guides;
create trigger trg_guide_status after update on public.guides
  for each row execute function public.log_guide_status();

-- 4) OPCIONAL: ocultar del directorio a quienes tengan el carné vencido (hoy solo se oculta por active=false)
-- create or replace view public.guides_with_stats as
-- select g.id, g.full_name, g.carnet, g.rnt, g.photo_url, g.languages, g.specialties,
--        g.department, g.whatsapp, g.bio,
--        round(avg(r.rating)::numeric, 1)::float8 as avg_rating, count(r.id)::int as reviews_count
-- from public.guides g
-- left join public.reviews r on r.guide_id = g.id and r.status = 'approved'
-- where g.active and (g.valid_until is null or g.valid_until >= current_date)
-- group by g.id;
