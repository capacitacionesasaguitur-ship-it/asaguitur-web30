import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { json } from '../../../lib/http';
import { UUID_RE } from '../../../lib/carnet';
import { audit } from '../../../lib/admin';

export const prerender = false;

// El formulario envía "2026-11-20T09:00" (hora de El Salvador, UTC-6 todo el año)
const svToIso = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00-06:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const txt = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max) || null;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!supabaseAdmin) return json({ error: 'Servicio no configurado.' }, 503);
  const b = await request.json().catch(() => ({}));

  if (b.action === 'toggle') {
    const id = String(b.id ?? '');
    if (!UUID_RE.test(id)) return json({ error: 'Evento no válido.' }, 400);
    const { error } = await supabaseAdmin.from('events').update({ published: b.published === true }).eq('id', id);
    if (error) return json({ error: 'No pudimos actualizar el evento.' }, 500);
    await audit(locals.user.id, 'event.toggle', id, { published: b.published === true });
    return json({ ok: true });
  }

  const title = String(b.title ?? '').trim();
  const starts = svToIso(b.starts_at);
  const ends = b.ends_at ? svToIso(b.ends_at) : null;
  const capacity = Number(b.capacity);
  const price = Number(b.price_member ?? 0);
  if (title.length < 3 || title.length > 160) return json({ error: 'El título debe tener entre 3 y 160 caracteres.' }, 400);
  if (!starts) return json({ error: 'Indica fecha y hora de inicio.' }, 400);
  if (b.ends_at && (!ends || ends <= starts)) return json({ error: 'La hora de cierre debe ser posterior al inicio.' }, 400);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000) return json({ error: 'Los cupos deben ser un número entre 1 y 1,000.' }, 400);
  if (!(price >= 0) || price > 10000) return json({ error: 'El precio no es válido (usa 0 para gratis).' }, 400);

  const { data, error } = await supabaseAdmin.from('events').insert({
    title, starts_at: starts, ends_at: ends, capacity, price_member: Math.round(price * 100) / 100,
    summary: txt(b.summary, 600), agenda: txt(b.agenda, 4000), speaker: txt(b.speaker, 160), location: txt(b.location, 200),
    published: b.published === true,
  }).select('id').single();
  if (error || !data) { console.error('events insert:', error?.message); return json({ error: 'No pudimos guardar el evento.' }, 500); }
  await audit(locals.user.id, 'event.create', data.id, { title });
  return json({ ok: true });
};
