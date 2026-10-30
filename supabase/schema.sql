-- Ejecutar en Supabase → SQL Editor

create table public.guides (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  carnet      text not null unique,
  rnt         text not null,
  photo_url   text,
  languages   text[] not null default '{}',
  specialties text[] not null default '{}',
  department  text not null,
  whatsapp    text not null,
  bio         text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  guide_id    uuid not null references public.guides(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 2 and 60),
  rating      smallint not null check (rating between 1 and 5),
  comment     text not null check (char_length(comment) between 10 and 800),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now()
);
create index on public.reviews (guide_id, status);

create table public.whatsapp_clicks (
  id         bigint generated always as identity primary key,
  guide_id   uuid not null references public.guides(id) on delete cascade,
  source     text,
  created_at timestamptz not null default now()
);
create index on public.whatsapp_clicks (guide_id, created_at);

-- Vista pública: guía + promedio + total de reseñas APROBADAS
create view public.guides_with_stats as
select g.id, g.full_name, g.carnet, g.rnt, g.photo_url, g.languages, g.specialties,
       g.department, g.whatsapp, g.bio,
       round(avg(r.rating)::numeric, 1)::float8 as avg_rating,
       count(r.id)::int as reviews_count
from public.guides g
left join public.reviews r on r.guide_id = g.id and r.status = 'approved'
where g.active
group by g.id;

-- RLS: el público solo lee; las escrituras entran por /api con la service role
alter table public.guides          enable row level security;
alter table public.reviews         enable row level security;
alter table public.whatsapp_clicks enable row level security;

create policy "lectura pública de guías activas" on public.guides  for select using (active);
create policy "lectura pública de reseñas aprobadas" on public.reviews for select using (status = 'approved');

-- Métricas por guía (para el panel de administración de la fase siguiente)
create view public.guide_click_stats as
select guide_id, count(*) as total_clicks,
       count(*) filter (where created_at > now() - interval '30 days') as clicks_30d
from public.whatsapp_clicks group by guide_id;
