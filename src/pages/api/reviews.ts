import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/supabase';

export const prerender = false;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return json({ error: 'Solicitud inválida.' }, 400); }

  if (b.website) return json({ ok: true }); // honeypot: fingimos éxito ante bots

  const guide_id = String(b.guide_id ?? '');
  const author_name = String(b.author_name ?? '').trim();
  const comment = String(b.comment ?? '').trim();
  const rating = Number(b.rating);

  if (!UUID.test(guide_id)) return json({ error: 'Guía no válido.' }, 400);
  if (author_name.length < 2 || author_name.length > 60) return json({ error: 'El nombre debe tener entre 2 y 60 caracteres.' }, 400);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: 'La calificación debe ser de 1 a 5.' }, 400);
  if (comment.length < 10 || comment.length > 800) return json({ error: 'El comentario debe tener entre 10 y 800 caracteres.' }, 400);
  if (!supabaseAdmin) return json({ error: 'El servicio de reseñas aún no está configurado.' }, 503);

  const { error } = await supabaseAdmin.from('reviews').insert({ guide_id, author_name, rating, comment, status: 'pending' });
  if (error) { console.error('reviews insert:', error.message); return json({ error: 'No pudimos guardar tu reseña.' }, 500); }
  return json({ ok: true }, 201);
};
