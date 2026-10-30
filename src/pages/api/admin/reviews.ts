import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { json } from '../../../lib/http';
import { UUID_RE } from '../../../lib/carnet';
import { audit } from '../../../lib/admin';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!supabaseAdmin) return json({ error: 'Servicio no configurado.' }, 503);
  const b = await request.json().catch(() => ({}));
  const id = String(b.id ?? '');
  const status = String(b.status ?? '');
  if (!UUID_RE.test(id) || !['approved', 'rejected'].includes(status)) return json({ error: 'Solicitud no válida.' }, 400);

  const { data, error } = await supabaseAdmin.from('reviews').update({ status }).eq('id', id).select('id').maybeSingle();
  if (error || !data) return json({ error: 'No encontramos esa reseña.' }, error ? 500 : 404);
  await audit(locals.user.id, 'review.moderate', id, { status });
  return json({ ok: true });
};
