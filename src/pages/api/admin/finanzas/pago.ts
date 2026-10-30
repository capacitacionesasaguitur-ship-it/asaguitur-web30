import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabase';
import { json } from '../../../../lib/http';
import { siteBase } from '../../../../lib/env';
import { UUID_RE } from '../../../../lib/carnet';
import { audit, isoDate } from '../../../../lib/admin';
import { enviarReciboPorCorreo, hoyISO } from '../../../../lib/finanzas';

export const prerender = false;

const ERRORES: Record<string, string> = {
  socio_no_encontrado: 'El socio no existe.',
  concepto_invalido: 'El concepto no es válido.',
  monto_invalido: 'El monto no es válido.',
  fecha_invalida: 'La fecha del pago no es válida (no puede ser futura).',
  evento_no_encontrado: 'Elige el evento al que corresponde el pago.',
};
const COMPROBANTE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$/;

// Registra un pago manual: aplica a las cuotas más antiguas, genera el recibo, lo envía por correo y actualiza el saldo.
export const POST: APIRoute = async ({ request, locals, url }) => {
  const admin = supabaseAdmin;
  if (!admin) return json({ error: 'Servicio no configurado.' }, 503);
  const b = await request.json().catch(() => ({}));

  const guide = String(b.guide_id ?? '');
  if (!UUID_RE.test(guide)) return json({ error: 'Elige un socio de la lista.' }, 400);
  const concepto = String(b.concepto ?? '');
  if (!['cuota', 'evento', 'otro'].includes(concepto)) return json({ error: 'Elige el concepto del pago.' }, 400);
  const fecha = isoDate(b.fecha) ? b.fecha : null;
  if (!fecha) return json({ error: 'La fecha del pago no es válida.' }, 400);
  if (fecha > hoyISO()) return json({ error: 'La fecha del pago no puede ser futura.' }, 400);
  const monto = Math.round(Number(b.monto) * 100) / 100;
  if (!(monto > 0) || monto > 100000) return json({ error: 'El monto debe ser mayor que cero.' }, 400);
  const evento = concepto === 'evento' ? String(b.event_id ?? '') : '';
  if (concepto === 'evento' && !UUID_RE.test(evento)) return json({ error: 'Elige el evento al que corresponde el pago.' }, 400);
  const referencia = String(b.referencia ?? '').trim().slice(0, 60);
  const observaciones = String(b.observaciones ?? '').trim().slice(0, 300);
  if (concepto === 'otro' && observaciones.length < 3) return json({ error: 'Para "otro concepto" escribe en observaciones de qué es el pago.' }, 400);
  const comprobante = b.comprobante_path ? String(b.comprobante_path) : null;
  if (comprobante && !COMPROBANTE_RE.test(comprobante)) return json({ error: 'El comprobante no es válido.' }, 400);

  // Aviso de boleta repetida (se puede confirmar para registrarla igual)
  if (referencia && b.confirmar_duplicado !== true) {
    const { data: dup } = await admin.from('payments').select('recibo_numero, amount, fecha_pago, guides(full_name)')
      .eq('referencia', referencia).eq('status', 'paid').limit(1);
    if (dup?.length) {
      const d: any = dup[0]; const g = Array.isArray(d.guides) ? d.guides[0] : d.guides;
      return json({
        error: `La referencia "${referencia}" ya fue registrada en el recibo ${d.recibo_numero} (${g?.full_name ?? 'otro socio'}, ${Number(d.amount).toFixed(2)} USD).`,
        duplicado: true,
      }, 409);
    }
  }

  const { data, error } = await admin.rpc('registrar_pago', {
    p_guide: guide, p_fecha: fecha, p_monto: monto, p_concepto: concepto, p_referencia: referencia || null,
    p_comprobante: comprobante, p_observaciones: observaciones || null, p_event: evento || null, p_admin: locals.user.id,
  });
  if (error) {
    const code = Object.keys(ERRORES).find((k) => error.message.includes(k));
    if (code) return json({ error: ERRORES[code] }, 400);
    console.error('registrar_pago:', error.message);
    return json({ error: 'No pudimos registrar el pago.' }, 500);
  }
  const r = (Array.isArray(data) ? data[0] : data) as { r_payment: string; r_recibo: string; r_saldo: number; r_reactivado: boolean };
  await audit(locals.user.id, 'pago.registrar', r.r_payment, { guide, monto, concepto, recibo: r.r_recibo, referencia });

  const correo = await enviarReciboPorCorreo(r.r_payment, siteBase(url.origin), r.r_reactivado);
  return json({ ok: true, payment_id: r.r_payment, recibo: r.r_recibo, saldo: Number(r.r_saldo), reactivado: r.r_reactivado, correo });
};
