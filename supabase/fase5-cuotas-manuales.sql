-- Fase 5 · Cuotas mensuales, pagos manuales con recibo, mora automática y rol de tesorero.
-- Ejecutar en Supabase → SQL Editor, UNA sola vez, después de fase4-admin.sql.
-- Los pagos los registra la Tesorería con su comprobante (pagos manuales).

-- ============ 1) Configuración (la Junta la cambia con un UPDATE, sin tocar código) ============
create table if not exists public.config (
  clave text primary key,
  valor text not null,
  nota  text
);
insert into public.config (clave, valor, nota) values
  ('cuota_mensual',          '3.00',       'Cuota mensual en USD (la fija la Asamblea General, art. 13 e).'),
  ('cuotas_desde',           '2026-11-01', 'Primer mes con cuota en el sistema. Todos los socios comienzan en noviembre de 2026.'),
  ('dia_vencimiento',        '25',         'Día del mes en que vence la cuota. Pasado ese día, la cuota cuenta como vencida.'),
  ('meses_mora_inactivar',   '6',          'Cuotas vencidas sin pagar para pasar a "inactivo por mora".'),
  ('meses_mora_reactivar',   '2',          'Un socio inactivo por mora se reactiva cuando le quedan este número de cuotas vencidas o menos.'),
  ('firmante_nombre',        'José Orlando Corvera Sorto', 'Nombre que firma los recibos.'),
  ('firmante_cargo',         'Presidente', 'Cargo que firma los recibos.')
on conflict (clave) do nothing;
alter table public.config enable row level security;      -- sin políticas: solo el servidor
revoke all on public.config from anon, authenticated;

create or replace function public.cfg(p_clave text) returns text
language sql stable security definer set search_path = public as $$
  select valor from public.config where clave = p_clave $$;
revoke all on function public.cfg(text) from public, anon, authenticated;
grant execute on function public.cfg(text) to service_role;

-- Fecha de hoy en El Salvador (la base de datos trabaja en UTC)
create or replace function public.hoy_sv() returns date
language sql stable as $$ select (now() at time zone 'America/El_Salvador')::date $$;

-- ============ 2) Estado del socio ============
--   pendiente     : ficha creada, perfil en preparación; no se ve en el directorio y NO paga cuotas
--   activo        : visible en el directorio, carné vigente; paga cuotas desde el mes en que se activa
--   inactivo_mora : 6 cuotas vencidas sin pagar; oculto del directorio; se reactiva al quedarle 2 o menos
--   baja          : retirado por decisión de la Junta; no genera cuotas
alter table public.guides
  add column if not exists estado      text not null default 'pendiente',
  add column if not exists activado_en date,
  add column if not exists tipo_guia   text,
  add column if not exists baja_motivo text;
alter table public.guides alter column estado set default 'pendiente';   -- los socios nuevos entran como pendientes
alter table public.guides drop constraint if exists guides_estado_check;
alter table public.guides add constraint guides_estado_check check (estado in ('pendiente', 'activo', 'inactivo_mora', 'baja'));
alter table public.guides drop constraint if exists guides_tipo_guia_check;
alter table public.guides add constraint guides_tipo_guia_check check (tipo_guia is null or tipo_guia in ('sitio', 'local', 'nacional'));

-- "active" sigue siendo lo que leen el directorio, el carné y los eventos; ahora se deriva de "estado".
-- Además se anota la fecha en que el socio se activa (de ahí cuenta su primera cuota).
create or replace function public.sync_active() returns trigger
language plpgsql as $$
begin
  new.active := (new.estado = 'activo');
  if new.estado = 'activo' and (tg_op = 'INSERT' or old.estado in ('pendiente', 'baja')) then
    new.activado_en := public.hoy_sv();
  end if;
  return new;
end $$;
drop trigger if exists trg_sync_active on public.guides;
create trigger trg_sync_active before insert or update on public.guides
  for each row execute function public.sync_active();

-- Los socios que ya existían conservan su situación; los activos comienzan a pagar en la fecha de "cuotas_desde"
update public.guides set estado = case when active then 'activo' else 'baja' end;
update public.guides set activado_en = public.cfg('cuotas_desde')::date where estado = 'activo';

grant select (tipo_guia) on public.guides to anon, authenticated;

-- ============ 3) Cuotas mensuales ============
create table if not exists public.cuotas (
  id         uuid primary key default gen_random_uuid(),
  guide_id   uuid not null references public.guides(id) on delete cascade,
  periodo    date not null check (periodo = date_trunc('month', periodo)::date),   -- primer día del mes
  monto      numeric(10,2) not null check (monto > 0),
  pagado     numeric(10,2) not null default 0 check (pagado >= 0),
  created_at timestamptz not null default now(),
  unique (guide_id, periodo)
);
create index if not exists cuotas_guide_idx on public.cuotas (guide_id, periodo);
alter table public.cuotas enable row level security;
revoke all on public.cuotas from anon, authenticated;
grant select on public.cuotas to authenticated;
drop policy if exists "socio ve sus cuotas" on public.cuotas;
create policy "socio ve sus cuotas" on public.cuotas for select to authenticated using (guide_id = public.my_guide_id());

-- ============ 4) Pagos manuales (se reutiliza la tabla payments) ============
alter table public.payments
  add column if not exists fecha_pago      date,
  add column if not exists referencia      text,
  add column if not exists comprobante_path text,
  add column if not exists observaciones   text,
  add column if not exists recibo_numero   text unique,
  add column if not exists saldo_despues   numeric(10,2),
  add column if not exists registrado_por  uuid references auth.users(id) on delete set null,
  add column if not exists anulado_motivo  text,
  add column if not exists anulado_por     uuid references auth.users(id) on delete set null,
  add column if not exists anulado_at      timestamptz;

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('invited', 'pending', 'paid', 'failed', 'cancelled', 'voided'));
alter table public.payments drop constraint if exists payments_concept_check;
alter table public.payments add constraint payments_concept_check check (concept in ('cuota', 'evento', 'otro'));
create index if not exists payments_ref_idx on public.payments (lower(referencia)) where referencia is not null;

create table if not exists public.recibo_contador (
  anio   int primary key,
  ultimo int not null default 0
);
alter table public.recibo_contador enable row level security;
revoke all on public.recibo_contador from anon, authenticated;

-- ============ 5) Roles: junta (todo) y tesorero (solo finanzas) ============
alter table public.admins add column if not exists rol text not null default 'junta';
alter table public.admins drop constraint if exists admins_rol_check;
alter table public.admins add constraint admins_rol_check check (rol in ('junta', 'tesorero'));

create or replace function public.is_admin() returns boolean       -- Junta Directiva: acceso a todo el panel
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid() and rol = 'junta') $$;

create or replace function public.admin_role() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.admins where user_id = auth.uid() $$;
revoke all on function public.admin_role() from public, anon;
grant execute on function public.admin_role() to authenticated;

-- Para nombrar a un asistente o tesorero (debe tener usuario en Authentication):
--   insert into public.admins (user_id, note, rol)
--   select id, 'Tesorería', 'tesorero' from auth.users where email = 'correo@dominio.com';

-- ============ 6) Cálculo de saldos ============
-- Los pagos de cuota se aplican a las cuotas más antiguas primero (admite pagos parciales y adelantados).
-- Solo cuentan los pagos nuevos (con recibo): cualquier registro anterior sin recibo se ignora.
create or replace function public.recalcular_cuotas(p_guide uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_resto numeric; c record;
begin
  select coalesce(sum(amount), 0) into v_resto from public.payments
   where guide_id = p_guide and concept = 'cuota' and status = 'paid' and recibo_numero is not null;
  for c in select id, monto from public.cuotas where guide_id = p_guide order by periodo loop
    update public.cuotas set pagado = least(c.monto, v_resto) where id = c.id and pagado is distinct from least(c.monto, v_resto);
    v_resto := greatest(v_resto - c.monto, 0);
  end loop;
end $$;

revoke all on function public.recalcular_cuotas(uuid) from public, anon, authenticated;
grant execute on function public.recalcular_cuotas(uuid) to service_role;

-- Estado de cuenta de todos los socios. Una cuota está "vencida" cuando pasó su día de vencimiento (el 25 de su mes).
create or replace view public.cuentas as
with t as (
  select g.id as guide_id,
         coalesce(sum(c.monto), 0)                    as total_cuotas,
         coalesce(sum(c.pagado), 0)                   as total_aplicado,
         coalesce(sum(c.monto - c.pagado) filter (where (c.periodo + (coalesce(public.cfg('dia_vencimiento'), '25')::int - 1)) < public.hoy_sv()), 0) as saldo_vencido,
         (count(*) filter (where (c.periodo + (coalesce(public.cfg('dia_vencimiento'), '25')::int - 1)) < public.hoy_sv() and c.pagado < c.monto))::int as meses_mora
  from public.guides g left join public.cuotas c on c.guide_id = g.id
  group by g.id
), p as (
  select guide_id, coalesce(sum(amount), 0) as cobrado
  from public.payments
  where concept = 'cuota' and status = 'paid' and recibo_numero is not null
  group by guide_id
)
select t.guide_id,
       (t.total_cuotas - t.total_aplicado)                                  as saldo_total,      -- lo que falta por pagar de lo generado
       t.saldo_vencido,
       t.meses_mora,
       greatest(coalesce(p.cobrado, 0) - t.total_cuotas, 0)                 as saldo_a_favor,    -- pagos adelantados
       case when t.meses_mora = 0 then 'al_dia'
            when t.meses_mora >= coalesce(public.cfg('meses_mora_inactivar'), '6')::int then 'en_mora'
            else 'pendiente' end                                            as finance_status
from t left join p on p.guide_id = t.guide_id;
revoke all on public.cuentas from anon, authenticated;
grant select on public.cuentas to service_role;

-- Primer mes que paga un socio: el de su activación; si lo activan después del día de vencimiento, el mes siguiente.
create or replace function public.primer_periodo(p_activado date) returns date
language sql stable as $$
  select greatest(
    date_trunc('month', public.cfg('cuotas_desde')::date)::date,
    (case when extract(day from p_activado) > coalesce(public.cfg('dia_vencimiento'), '25')::int
          then date_trunc('month', p_activado + interval '1 month')
          else date_trunc('month', p_activado) end)::date) $$;

-- Genera las cuotas que falten hasta el mes indicado (por defecto, el mes actual).
-- Es segura de ejecutar muchas veces. Solo genera cuotas a socios activos o inactivos por mora
-- (no a pendientes ni a dados de baja).
create or replace function public.generar_cuotas(p_hasta date default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_hasta date := date_trunc('month', coalesce(p_hasta, public.hoy_sv()))::date;
  v_desde date := date_trunc('month', public.cfg('cuotas_desde')::date)::date;
  v_monto numeric := public.cfg('cuota_mensual')::numeric;
  n int;
begin
  insert into public.cuotas (guide_id, periodo, monto)
  select g.id, m::date, v_monto
  from public.guides g
  cross join generate_series(v_desde::timestamp, v_hasta::timestamp, interval '1 month') m
  where g.estado in ('activo', 'inactivo_mora')
    and m::date >= public.primer_periodo(coalesce(g.activado_en, v_desde))
  on conflict (guide_id, periodo) do nothing;
  get diagnostics n = row_count;
  perform public.recalcular_cuotas(g.id) from public.guides g where g.estado in ('activo', 'inactivo_mora');
  return n;
end $$;
revoke all on function public.generar_cuotas(date) from public, anon, authenticated;
grant execute on function public.generar_cuotas(date) to service_role;

-- Inactiva por mora (6 o más cuotas vencidas) y reactiva a quien baja a 2 cuotas vencidas o menos. Devuelve los cambios para avisar por correo.
create or replace function public.procesar_mora() returns table (r_guide uuid, r_cambio text)
language plpgsql security definer set search_path = public as $$
declare
  v_umbral int  := coalesce(public.cfg('meses_mora_inactivar'), '6')::int;
  v_react  int  := coalesce(public.cfg('meses_mora_reactivar'), '2')::int;
begin
  return query
    with u as (
      update public.guides g set estado = 'inactivo_mora'
        from public.cuentas c
       where c.guide_id = g.id and g.estado = 'activo' and c.meses_mora >= v_umbral
      returning g.id)
    select u.id, 'inactivado'::text from u;
  return query
    with r as (
      update public.guides g set estado = 'activo'
        from public.cuentas c
       where c.guide_id = g.id and g.estado = 'inactivo_mora' and c.meses_mora <= v_react
      returning g.id)
    select r.id, 'reactivado'::text from r;
end $$;
revoke all on function public.procesar_mora() from public, anon, authenticated;
grant execute on function public.procesar_mora() to service_role;

-- ============ 7) Registrar y anular pagos (solo el servidor) ============
create or replace function public.registrar_pago(
  p_guide uuid, p_fecha date, p_monto numeric, p_concepto text, p_referencia text,
  p_comprobante text, p_observaciones text, p_event uuid, p_admin uuid)
returns table (r_payment uuid, r_recibo text, r_saldo numeric, r_reactivado boolean)
language plpgsql security definer set search_path = public as $$
declare
  g public.guides%rowtype; ev public.events%rowtype; v_anio int; v_num int; v_recibo text;
  v_desc text; v_pay uuid; v_cta record; v_saldo numeric; v_react boolean := false;
begin
  select * into g from public.guides where id = p_guide for update;          -- serializa los pagos de un mismo socio
  if not found then raise exception 'socio_no_encontrado'; end if;
  if p_concepto not in ('cuota', 'evento', 'otro') then raise exception 'concepto_invalido'; end if;
  if p_monto is null or p_monto <= 0 or p_monto > 100000 then raise exception 'monto_invalido'; end if;
  if p_fecha is null or p_fecha > public.hoy_sv() + 1 or p_fecha < date '2020-01-01' then raise exception 'fecha_invalida'; end if;

  if p_concepto = 'evento' then
    select * into ev from public.events where id = p_event;
    if not found then raise exception 'evento_no_encontrado'; end if;
    v_desc := 'Inscripción: ' || ev.title;
  elsif p_concepto = 'cuota' then
    v_desc := 'Pago de cuotas de membresía';
  else
    v_desc := coalesce(nullif(trim(p_observaciones), ''), 'Otro concepto');
  end if;

  v_anio := extract(year from public.hoy_sv())::int;
  insert into public.recibo_contador (anio, ultimo) values (v_anio, 1)
    on conflict (anio) do update set ultimo = public.recibo_contador.ultimo + 1
    returning ultimo into v_num;
  v_recibo := 'ASAG-' || v_anio || '-' || lpad(v_num::text, 4, '0');

  insert into public.payments (guide_id, concept, event_id, description, amount, status, paid_at, fecha_pago, referencia,
                               comprobante_path, observaciones, recibo_numero, registrado_por)
  values (p_guide, p_concepto, case when p_concepto = 'evento' then p_event end, v_desc, round(p_monto, 2), 'paid', now(), p_fecha,
          nullif(trim(p_referencia), ''), p_comprobante, nullif(trim(p_observaciones), ''), v_recibo, p_admin)
  returning id into v_pay;

  if p_concepto = 'cuota' then
    perform public.generar_cuotas();                       -- por si el mes actual aún no tenía cuota
    perform public.recalcular_cuotas(p_guide);
  elsif p_concepto = 'evento' then
    insert into public.event_registrations (event_id, guide_id, payment_id, status, confirmed_at)
    values (p_event, p_guide, v_pay, 'confirmed', now())
    on conflict (event_id, guide_id) do update set status = 'confirmed', confirmed_at = now(), payment_id = v_pay;
  end if;

  select * into v_cta from public.cuentas where guide_id = p_guide;
  v_saldo := v_cta.saldo_total - v_cta.saldo_a_favor;      -- negativo = saldo a favor
  update public.payments set saldo_despues = v_saldo where id = v_pay;

  if g.estado = 'inactivo_mora' and v_cta.meses_mora <= coalesce(public.cfg('meses_mora_reactivar'), '2')::int then
    update public.guides set estado = 'activo' where id = p_guide;
    v_react := true;
  end if;

  return query select v_pay, v_recibo, v_saldo, v_react;
end $$;

create or replace function public.anular_pago(p_payment uuid, p_motivo text, p_admin uuid)
returns table (r_guide uuid, r_recibo text) language plpgsql security definer set search_path = public as $$
declare pay public.payments%rowtype;
begin
  if char_length(coalesce(trim(p_motivo), '')) < 5 then raise exception 'motivo_requerido'; end if;
  select * into pay from public.payments where id = p_payment for update;
  if not found or pay.recibo_numero is null then raise exception 'pago_no_encontrado'; end if;
  if pay.status = 'voided' then raise exception 'ya_anulado'; end if;

  update public.payments set status = 'voided', anulado_motivo = trim(p_motivo), anulado_por = p_admin, anulado_at = now()
   where id = pay.id;
  if pay.concept = 'cuota' then
    perform public.recalcular_cuotas(pay.guide_id);
  elsif pay.concept = 'evento' then
    update public.event_registrations set status = 'cancelled' where payment_id = pay.id;
  end if;
  return query select pay.guide_id, pay.recibo_numero;
end $$;

revoke all on function public.registrar_pago(uuid, date, numeric, text, text, text, text, uuid, uuid),
                       public.anular_pago(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.registrar_pago(uuid, date, numeric, text, text, text, text, uuid, uuid),
                          public.anular_pago(uuid, text, uuid) to service_role;

-- ============ 8) Eventos: inscripción con pago manual ============
-- Gratis: queda confirmada. De pago: queda "pendiente" (reserva el cupo 7 días) hasta que Tesorería registre el pago.
drop function if exists public.register_for_event(uuid, uuid);
create or replace function public.register_for_event(p_event_id uuid, p_guide_id uuid)
returns table (r_status text, r_amount numeric, r_title text)
language plpgsql security definer set search_path = public as $$
declare ev public.events%rowtype; reg public.event_registrations%rowtype; v_taken int; v_found boolean;
begin
  select * into ev from public.events e where e.id = p_event_id and e.published for update;
  if not found then raise exception 'evento_no_disponible'; end if;
  if ev.starts_at < now() then raise exception 'evento_pasado'; end if;
  if not exists (select 1 from public.guides g where g.id = p_guide_id and g.active) then raise exception 'socio_inactivo'; end if;

  select * into reg from public.event_registrations er where er.event_id = p_event_id and er.guide_id = p_guide_id for update;
  v_found := found;
  if v_found and reg.status = 'confirmed' then raise exception 'ya_inscrito'; end if;

  select count(*) into v_taken from public.event_registrations er
   where er.event_id = p_event_id and er.guide_id <> p_guide_id
     and (er.status = 'confirmed' or (er.status = 'pending' and er.created_at > now() - interval '7 days'));
  if v_taken >= ev.capacity then raise exception 'sin_cupos'; end if;

  if ev.price_member = 0 then
    if v_found then update public.event_registrations set status = 'confirmed', confirmed_at = now() where id = reg.id;
    else insert into public.event_registrations (event_id, guide_id, status, confirmed_at) values (p_event_id, p_guide_id, 'confirmed', now());
    end if;
    return query select 'confirmed'::text, 0::numeric, ev.title;
  end if;

  if v_found then update public.event_registrations set status = 'pending', created_at = now() where id = reg.id;
  else insert into public.event_registrations (event_id, guide_id) values (p_event_id, p_guide_id);
  end if;
  return query select 'pending'::text, ev.price_member, ev.title;
end $$;
revoke all on function public.register_for_event(uuid, uuid) from public, anon, authenticated;
grant execute on function public.register_for_event(uuid, uuid) to service_role;

create or replace view public.events_with_seats as
select e.*, greatest(e.capacity - coalesce(r.taken, 0), 0) as seats_left
from public.events e
left join lateral (
  select count(*)::int as taken from public.event_registrations er
  where er.event_id = e.id
    and (er.status = 'confirmed' or (er.status = 'pending' and er.created_at > now() - interval '7 days'))
) r on true
where e.published and public.is_active_member();

-- ============ 9) Lo que ve el socio y la Junta ============
-- Perfil del propio socio (se recrea para agregar "estado")
drop function if exists public.member_overview();
create or replace function public.member_overview()
returns table (id uuid, full_name text, carnet text, rnt text, photo_url text, languages text[], specialties text[],
               department text, whatsapp text, bio text, active boolean, member_since date, valid_until date,
               finance_status text, email text, estado text)
language sql stable security definer set search_path = public as $$
  select g.id, g.full_name, g.carnet, g.rnt, g.photo_url, g.languages, g.specialties, g.department,
         g.whatsapp, g.bio, g.active, g.member_since, g.valid_until,
         coalesce(c.finance_status, 'al_dia'), g.email, g.estado
  from public.guides g left join public.cuentas c on c.guide_id = g.id
  where g.user_id = auth.uid() $$;

create or replace function public.mi_cuenta()
returns table (saldo_total numeric, saldo_vencido numeric, meses_mora int, saldo_a_favor numeric)
language sql stable security definer set search_path = public as $$
  select c.saldo_total, c.saldo_vencido, c.meses_mora, c.saldo_a_favor
  from public.cuentas c join public.guides g on g.id = c.guide_id
  where g.user_id = auth.uid() $$;

revoke all on function public.member_overview(), public.mi_cuenta() from public, anon;
grant execute on function public.member_overview(), public.mi_cuenta() to authenticated;

-- Vista de la Junta: se agregan columnas al final (las anteriores no cambian)
create or replace view public.admin_members as
select g.id, g.full_name, g.carnet, g.email, g.active, g.valid_until, g.user_id,
       coalesce(c.finance_status, 'al_dia') as finance_status,
       g.estado, g.tipo_guia,
       coalesce(c.saldo_vencido, 0) as saldo_vencido,
       coalesce(c.saldo_total, 0)   as saldo_total,
       coalesce(c.meses_mora, 0)    as meses_mora,
       coalesce(c.saldo_a_favor, 0) as saldo_a_favor
from public.guides g left join public.cuentas c on c.guide_id = g.id;
revoke all on public.admin_members from anon, authenticated;
grant select on public.admin_members to service_role;

-- ============ 10) Avisos por correo (evita enviar dos veces el mismo aviso en un mes) ============
create table if not exists public.avisos_enviados (
  id         bigint generated always as identity primary key,
  guide_id   uuid not null references public.guides(id) on delete cascade,
  tipo       text not null check (tipo in ('por_vencer', 'recordatorio', 'inactivacion', 'reactivacion')),
  periodo    date not null,
  created_at timestamptz not null default now(),
  unique (guide_id, tipo, periodo)
);
alter table public.avisos_enviados enable row level security;
revoke all on public.avisos_enviados from anon, authenticated;

-- ============ 11) Almacenamiento privado ============
-- comprobantes : fotos o PDF de las boletas del banco (solo la Tesorería las sube y las ve)
-- recibos-assets : firma.png y sello.png que se estampan en los recibos (se suben a mano, una vez)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public) values ('recibos-assets', 'recibos-assets', false) on conflict (id) do nothing;

-- ============ 12) Generar las cuotas (desde noviembre de 2026) ============
-- Crea la cuota de noviembre de 2026 (y las siguientes) para los socios activos, a $3.00 cada una.
-- Antes de noviembre no hace nada. Después, la tarea diaria genera la cuota de cada mes el día 1.
select public.generar_cuotas();
