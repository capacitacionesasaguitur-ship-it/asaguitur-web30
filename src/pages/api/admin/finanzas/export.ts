import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabase';
import { csv, hoyISO } from '../../../../lib/finanzas';
import { isoDate } from '../../../../lib/admin';

export const prerender = false;

// GET /api/admin/finanzas/export?tipo=pagos&desde=2026-01-01&hasta=2026-12-31   |   ?tipo=saldos
// Se abre directo en Excel (CSV con UTF-8 y tildes).
export const GET: APIRoute = async ({ url }) => {
  const a = supabaseAdmin;
  if (!a) return new Response('Servicio no configurado.', { status: 503 });
  const tipo = url.searchParams.get('tipo') === 'saldos' ? 'saldos' : 'pagos';
  let filas: unknown[][];

  if (tipo === 'saldos') {
    const { data } = await a.from('admin_members').select('full_name, carnet, email, estado, finance_status, meses_mora, saldo_vencido, saldo_total, saldo_a_favor').order('full_name');
    filas = [['Socio', 'Carné', 'Correo', 'Estado', 'Cuenta', 'Cuotas vencidas', 'Saldo vencido (USD)', 'Saldo total del año (USD)', 'Saldo a favor (USD)'],
      ...(data ?? []).map((m: any) => [m.full_name, m.carnet, m.email, m.estado, m.finance_status, m.meses_mora, m.saldo_vencido, m.saldo_total, m.saldo_a_favor])];
  } else {
    const d = url.searchParams.get('desde'), h = url.searchParams.get('hasta');
    let q = a.from('payments').select('recibo_numero, fecha_pago, concept, description, amount, status, referencia, anulado_motivo, guides(full_name, carnet)')
      .not('recibo_numero', 'is', null).order('fecha_pago', { ascending: false });
    if (isoDate(d)) q = q.gte('fecha_pago', d);
    if (isoDate(h)) q = q.lte('fecha_pago', h);
    const { data } = await q;
    filas = [['Recibo', 'Fecha del pago', 'Socio', 'Carné', 'Concepto', 'Detalle', 'Monto (USD)', 'Estado', 'Referencia', 'Motivo de anulación'],
      ...(data ?? []).map((p: any) => { const g = Array.isArray(p.guides) ? p.guides[0] : p.guides;
        return [p.recibo_numero, p.fecha_pago, g?.full_name, g?.carnet, p.concept, p.description, p.amount, p.status === 'voided' ? 'Anulado' : 'Vigente', p.referencia, p.anulado_motivo]; })];
  }
  const body = '\uFEFF' + filas.map((f) => f.map(csv).join(',')).join('\r\n');
  return new Response(body, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="asaguitur-${tipo}-${hoyISO()}.csv"`, 'Cache-Control': 'private, no-store' },
  });
};
