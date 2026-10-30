import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabase';
import { json } from '../../../../lib/http';
import { UUID_RE } from '../../../../lib/carnet';
import { audit } from '../../../../lib/admin';

export const prerender = false;

// Un pago nunca se borra: se anula con motivo, el saldo se recalcula y queda registrado quién lo hizo.
export const POST: APIRoute = async ({ request, locals }) => {
  const admin = supabaseAdmin;
  if (!admin) return json({ error: 'Servicio no configurado.' }, 503);
  const b = await request.json().catch(() => ({}));
  const id = String(b.payment_id ?? '');
  const motivo = String(b.motivo ?? '').trim().slice(0, 300);
  if (!UUID_RE.test(id)) return json({ error: 'Pago no válido.' }, 400);
  if (motivo.length < 5) return json({ error: 'Escribe el motivo de la anulación (mínimo 5 caracteres).' }, 400);

  const { data, error } = await admin.rpc('anular_pago', { p_payment: id, p_motivo: motivo, p_admin: locals.user.id });
  if (error) {
    if (error.message.includes('ya_anulado')) return json({ error: 'Este pago ya estaba anulado.' }, 409);
    if (error.message.includes('pago_no_encontrado')) return json({ error: 'No encontramos ese pago.' }, 404);
    console.error('anular_pago:', error.message);
    return json({ error: 'No pudimos anular el pago.' }, 500);
  }
  const r = (Array.isArray(data) ? data[0] : data) as { r_recibo: string };
  await audit(locals.user.id, 'pago.anular', id, { motivo, recibo: r?.r_recibo });
  return json({ ok: true });
};
