import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabase';
import { json } from '../../../../lib/http';
import { UUID_RE } from '../../../../lib/carnet';

export const prerender = false;

const ERRORES: Record<string, [string, number]> = {
  evento_no_disponible: ['Este evento ya no está disponible.', 404],
  evento_pasado: ['Este evento ya comenzó.', 409],
  socio_inactivo: ['Solo los socios activos pueden inscribirse.', 403],
  ya_inscrito: ['Ya estás inscrito en este evento.', 409],
  sin_cupos: ['Los cupos de este evento se agotaron.', 409],
};

// Evento gratis → inscripción confirmada. Evento de pago → cupo reservado por 7 días; se confirma cuando
// la Tesorería registra el pago (Finanzas → Registrar un pago, concepto "Evento").
export const POST: APIRoute = async ({ locals, request }) => {
  if (!supabaseAdmin) return json({ error: 'El servicio de inscripciones aún no está configurado.' }, 503);
  const body = await request.json().catch(() => ({}));
  const eventId = String(body.event_id ?? '');
  if (!UUID_RE.test(eventId)) return json({ error: 'Evento no válido.' }, 400);

  const { data } = await locals.supabase.rpc('member_overview');
  const m = Array.isArray(data) ? data[0] : data;
  if (!m) return json({ error: 'Tu usuario todavía no está vinculado a un perfil de socio.' }, 403);

  const { data: rows, error } = await supabaseAdmin.rpc('register_for_event', { p_event_id: eventId, p_guide_id: m.id });
  if (error) {
    const code = Object.keys(ERRORES).find((k) => error.message.includes(k));
    if (code) return json({ error: ERRORES[code][0] }, ERRORES[code][1]);
    console.error('register_for_event:', error.message);
    return json({ error: 'No pudimos procesar tu inscripción.' }, 500);
  }
  const r = (Array.isArray(rows) ? rows[0] : rows) as { r_status: string; r_amount: number; r_title: string };
  return json({ status: r.r_status, amount: Number(r.r_amount), title: r.r_title });
};
