import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '../../../lib/supabase';
import { json } from '../../../lib/http';
import { env, siteBase } from '../../../lib/env';
import { renderEmail } from '../../../lib/mail';
import { sendBatch, type OutgoingEmail } from '../../../lib/resend';
import { hoyISO, leerConfig, mensajeAviso, type TipoAviso } from '../../../lib/finanzas';

export const prerender = false;

const igual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * Tarea diaria (la dispara netlify/functions/cron-diario.mjs a las 8:00 hora de El Salvador):
 *  1. Genera la cuota del mes para cada socio (el día 1 se crea la del mes nuevo).
 *  2. Inactiva por mora a quien llegó al límite y reactiva a quien se puso al día.
 *  3. Envía por correo los avisos (cada aviso se manda una sola vez por mes): el recordatorio del día 20 ("tu cuota vence el 25"),
 *     el de cuotas vencidas, la inactivación por mora y la reactivación.
 * Es segura de ejecutar varias veces el mismo día.
 */
export const POST: APIRoute = async ({ request, url }) => {
  const secret = env('CRON_SECRET') ?? '';
  if (secret.length < 16 || !igual(request.headers.get('x-cron-secret') ?? '', secret)) return json({ error: 'No autorizado.' }, 401);
  const a = supabaseAdmin;
  if (!a) return json({ error: 'Servicio no configurado.' }, 503);

  const nuevas = await a.rpc('generar_cuotas');
  if (nuevas.error) { console.error('generar_cuotas:', nuevas.error.message); return json({ error: 'No se pudieron generar las cuotas.' }, 500); }
  const mora = await a.rpc('procesar_mora');
  if (mora.error) { console.error('procesar_mora:', mora.error.message); return json({ error: 'No se pudo procesar la mora.' }, 500); }
  const cambios = (mora.data ?? []) as { r_guide: string; r_cambio: string }[];

  const cfg = await leerConfig();
  const umbral = Number(cfg.meses_mora_inactivar ?? 6);
  const reactivar = Number(cfg.meses_mora_reactivar ?? 2);
  const diaVence = Number(cfg.dia_vencimiento ?? 25);
  const cuota = Number(cfg.cuota_mensual ?? 3);
  const hoy = hoyISO();
  const periodo = `${hoy.slice(0, 7)}-01`;

  // Candidatos a aviso
  const candidatos = new Map<string, TipoAviso>();                              // guide_id → tipo
  for (const c of cambios) candidatos.set(c.r_guide, c.r_cambio === 'inactivado' ? 'inactivacion' : 'reactivacion');
  const { data: enMora } = await a.from('admin_members').select('id').eq('estado', 'activo').gte('meses_mora', 1);
  for (const m of enMora ?? []) if (!candidatos.has(m.id)) candidatos.set(m.id, 'recordatorio');

  // Del día 20 al día de vencimiento: aviso "tu cuota vence el 25" a quien aún no pagó la cuota de este mes
  const dia = Number(hoy.slice(8, 10));
  if (dia >= 20 && dia <= diaVence) {
    const { data: deMes } = await a.from('cuotas').select('guide_id, monto, pagado').eq('periodo', periodo);
    const sinPagar = (deMes ?? []).filter((c) => Number(c.pagado) < Number(c.monto)).map((c) => c.guide_id as string);
    if (sinPagar.length) {
      const { data: activos } = await a.from('guides').select('id').eq('estado', 'activo').in('id', sinPagar);
      for (const g of activos ?? []) if (!candidatos.has(g.id)) candidatos.set(g.id, 'por_vencer');
    }
  }

  let enviados = 0, fallidos = 0;
  if (candidatos.size && env('RESEND_API_KEY') && env('RESEND_FROM')) {
    const ids = [...candidatos.keys()];
    const [{ data: socios }, { data: previos }] = await Promise.all([
      a.from('admin_members').select('id, full_name, email, saldo_vencido, meses_mora').in('id', ids),
      a.from('avisos_enviados').select('guide_id, tipo').eq('periodo', periodo).in('guide_id', ids),
    ]);
    const yaEnviado = new Set((previos ?? []).map((p) => `${p.guide_id}|${p.tipo}`));
    const base = siteBase(url.origin);

    const pendientes = (socios ?? []).filter((s) => s.email && !yaEnviado.has(`${s.id}|${candidatos.get(s.id)}`)).map((s) => {
      const tipo = candidatos.get(s.id)!;
      const { subject, message } = mensajeAviso(tipo, { saldoVencido: Number(s.saldo_vencido), mesesMora: s.meses_mora, umbral, reactivar, cuota, diaVence });
      const { html, text } = renderEmail({
        name: String(s.full_name).split(' ')[0], message, button: { label: 'Ver mi estado de cuenta', url: `${base}/socio#pagos` }, logoUrl: `${base}/logo-email.png`,
      });
      return { s, tipo, mail: { to: s.email as string, subject, html, text } as OutgoingEmail };
    });

    for (let i = 0; i < pendientes.length; i += 100) {
      if (i > 0) await new Promise((r) => setTimeout(r, 600));
      const lote = pendientes.slice(i, i + 100);
      const out = await sendBatch(lote.map((p) => p.mail), `aviso-${periodo}-${hoy}-${i / 100}`);
      if ('error' in out) { console.error('avisos:', out.error); fallidos += lote.length; continue; }
      enviados += lote.length;
      await a.from('avisos_enviados').upsert(lote.map((p) => ({ guide_id: p.s.id, tipo: p.tipo, periodo })), { onConflict: 'guide_id,tipo,periodo', ignoreDuplicates: true });
    }
  }

  return json({
    ok: true, fecha: hoy, cuotas_nuevas: nuevas.data ?? 0,
    inactivados: cambios.filter((c) => c.r_cambio === 'inactivado').length,
    reactivados: cambios.filter((c) => c.r_cambio === 'reactivado').length,
    avisos_enviados: enviados, avisos_fallidos: fallidos,
  });
};
