import { supabaseAdmin } from './supabase';
import { crearReciboPdf, montoEnLetras, type ReciboData } from './recibo';
import { renderEmail } from './mail';
import { sendOne } from './resend';
import { env } from './env';

export const TZ = 'America/El_Salvador';
export const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });          // YYYY-MM-DD
export const usd = (n: number) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat('es-SV', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));

/** Lee la tabla public.config (cuota, plazos, firmante). */
export async function leerConfig(): Promise<Record<string, string>> {
  const { data, error } = await supabaseAdmin!.from('config').select('clave, valor');
  if (error) console.error('leerConfig:', error.message);
  return Object.fromEntries((data ?? []).map((r) => [r.clave as string, r.valor as string]));
}

// ---------- Recibos ----------
export async function cargarRecibo(paymentId: string): Promise<ReciboData | null> {
  const a = supabaseAdmin!;
  const { data: p, error } = await a.from('payments')
    .select('id, description, amount, status, fecha_pago, referencia, observaciones, recibo_numero, saldo_despues, anulado_motivo, anulado_at, created_at, guides(full_name, carnet)')
    .eq('id', paymentId).maybeSingle();
  if (error) { console.error('cargarRecibo:', error.message); return null; }
  if (!p || !p.recibo_numero) return null;
  const cfg = await leerConfig();
  const g = (Array.isArray(p.guides) ? p.guides[0] : p.guides) as { full_name: string; carnet: string } | null;
  return {
    numero: p.recibo_numero,
    fechaEmision: new Date(p.created_at).toLocaleDateString('en-CA', { timeZone: TZ }),
    fechaPago: p.fecha_pago ?? new Date(p.created_at).toLocaleDateString('en-CA', { timeZone: TZ }),
    socio: { nombre: g?.full_name ?? '(socio)', carnet: g?.carnet ?? '' },
    concepto: p.description,
    monto: Number(p.amount),
    referencia: p.referencia,
    observaciones: p.observaciones,
    saldoDespues: p.saldo_despues === null ? null : Number(p.saldo_despues),
    firmante: { nombre: cfg.firmante_nombre ?? 'Junta Directiva', cargo: cfg.firmante_cargo ?? '' },
    anulado: p.status === 'voided' && p.anulado_at
      ? { motivo: p.anulado_motivo ?? '', fecha: new Date(p.anulado_at).toLocaleDateString('en-CA', { timeZone: TZ }) } : null,
  };
}

export async function reciboPdf(paymentId: string): Promise<{ bytes: Uint8Array; numero: string } | null> {
  const d = await cargarRecibo(paymentId);
  if (!d) return null;
  return { bytes: await crearReciboPdf(d), numero: d.numero };
}

const PAGOS_INFO = () => (env('PAGOS_INSTRUCCIONES') ?? '').replace(/\\n/g, '\n').trim();

/** Envía el recibo por correo (con el PDF adjunto). Nunca lanza: devuelve el resultado para mostrarlo en el panel. */
export async function enviarReciboPorCorreo(paymentId: string, base: string, reactivado: boolean): Promise<'enviado' | 'sin_correo' | 'error'> {
  try {
    const a = supabaseAdmin!;
    const { data: p } = await a.from('payments').select('guide_id, amount, description, saldo_despues, recibo_numero').eq('id', paymentId).maybeSingle();
    if (!p) return 'error';
    const { data: g } = await a.from('guides').select('full_name, email').eq('id', p.guide_id).maybeSingle();
    if (!g?.email) return 'sin_correo';
    const pdf = await reciboPdf(paymentId);
    if (!pdf) return 'error';

    const saldo = p.saldo_despues === null ? null : Number(p.saldo_despues);
    const lineaSaldo = saldo === null ? '' : saldo > 0.004 ? `Tu saldo pendiente es de ${usd(saldo)}.`
      : saldo < -0.004 ? `Tienes un saldo a favor de ${usd(-saldo)}.` : 'Tu cuenta está al día: no tienes saldo pendiente.';
    const message = [
      `Hemos registrado tu pago de ${usd(Number(p.amount))} (${montoEnLetras(Number(p.amount))}).`,
      `Concepto: ${p.description}\nRecibo N.º ${p.recibo_numero}`,
      lineaSaldo,
      reactivado ? 'Con este pago tu membresía volvió a estar activa en el directorio y en tu carné digital.' : '',
      'Adjuntamos tu recibo en PDF. También puedes descargarlo en cualquier momento desde tu portal del socio.',
    ].filter(Boolean).join('\n\n');

    const { html, text } = renderEmail({
      name: g.full_name.split(' ')[0], message, button: { label: 'Ver mi estado de cuenta', url: `${base}/socio#pagos` }, logoUrl: `${base}/logo-email.png`,
    });
    const out = await sendOne({
      to: g.email, subject: `Recibo ${p.recibo_numero} · ASAGUITUR`, html, text,
      attachments: [{ filename: `Recibo-${p.recibo_numero}.pdf`, content: Buffer.from(pdf.bytes).toString('base64') }],
    }, `recibo-${paymentId}`);
    if ('error' in out) { console.error('enviarReciboPorCorreo:', out.error); return 'error'; }
    return 'enviado';
  } catch (e) { console.error('enviarReciboPorCorreo:', e); return 'error'; }
}

// ---------- Avisos (los usa la tarea diaria) ----------
export type TipoAviso = 'por_vencer' | 'recordatorio' | 'inactivacion' | 'reactivacion';
export interface DatosAviso { saldoVencido: number; mesesMora: number; umbral: number; reactivar: number; cuota: number; diaVence: number }

export function mensajeAviso(tipo: TipoAviso, d: DatosAviso): { subject: string; message: string } {
  const como = PAGOS_INFO();
  const pie = como ? `\n\nCómo pagar:\n${como}` : '\n\nPara pagar, comunícate con la Tesorería de ASAGUITUR y envía tu comprobante de pago.';
  if (tipo === 'por_vencer') {
    return { subject: `Tu cuota vence el ${d.diaVence} · ASAGUITUR`,
      message: `Te recordamos que tu cuota mensual de ${usd(d.cuota)} vence el día ${d.diaVence}. Si ya la pagaste, ignora este mensaje: la Tesorería actualizará tu estado de cuenta cuando registre tu pago.${pie}` };
  }
  if (tipo === 'reactivacion') {
    return { subject: 'Tu membresía ASAGUITUR está activa de nuevo',
      message: 'Con tu último pago tu cuenta bajó al límite permitido y tu membresía volvió a estar activa. Tu perfil ya se muestra en el directorio y tu carné digital aparece como vigente. Gracias.' };
  }
  if (tipo === 'inactivacion') {
    return { subject: 'Tu membresía ASAGUITUR pasó a inactiva por mora',
      message: `Tu estado de cuenta tiene ${d.mesesMora} cuotas mensuales vencidas sin pagar, por ${usd(d.saldoVencido)}. Por esa razón tu cuenta pasó a "inactiva por mora": tu perfil se oculta del directorio y tu carné digital aparece como "no activo".\n\nSe reactiva automáticamente cuando, con tus pagos, te queden ${d.reactivar} cuotas vencidas o menos. Si crees que hay un error, responde este correo o escribe a la Junta Directiva.${pie}` };
  }
  const alerta = d.mesesMora === d.umbral - 1
    ? `\n\nAtención: si llegas a ${d.umbral} cuotas vencidas, tu cuenta pasará a inactiva por mora (tu perfil se oculta del directorio y tu carné aparece como "no activo").` : '';
  return { subject: 'Recordatorio de cuota vencida · ASAGUITUR',
    message: `Tu estado de cuenta muestra ${d.mesesMora} ${d.mesesMora === 1 ? 'cuota vencida' : 'cuotas vencidas'} por un saldo de ${usd(d.saldoVencido)}. Las cuotas vencen el día ${d.diaVence} de cada mes. Puedes pagar de una sola vez o en pagos parciales.${alerta}${pie}` };
}

// ---------- Datos del panel de finanzas ----------
export async function cargarFinanzas() {
  const a = supabaseAdmin!;
  const hoy = hoyISO();
  const mesInicio = `${hoy.slice(0, 7)}-01`;
  const hace30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [socios, pagos, eventos, mes, cfg] = await Promise.all([
    a.from('admin_members').select('id, full_name, carnet, email, estado, finance_status, saldo_vencido, saldo_total, saldo_a_favor, meses_mora').order('full_name'),
    a.from('payments').select('id, concept, description, amount, status, fecha_pago, referencia, comprobante_path, recibo_numero, anulado_motivo, created_at, guides(full_name, carnet)')
      .not('recibo_numero', 'is', null).order('created_at', { ascending: false }).limit(60),
    a.from('events').select('id, title, starts_at, price_member').eq('published', true).gte('starts_at', hace30).order('starts_at'),
    a.from('payments').select('amount').eq('status', 'paid').not('recibo_numero', 'is', null).gte('fecha_pago', mesInicio),
    leerConfig(),
  ]);
  for (const r of [socios, pagos, eventos, mes]) if (r.error) console.error('cargarFinanzas:', r.error.message);

  const lista = (socios.data ?? []) as any[];
  const vigentes = lista.filter((s) => s.estado !== 'baja');
  return {
    socios: lista,
    pagos: ((pagos.data ?? []) as any[]).map((p) => ({ ...p, amount: Number(p.amount), guides: Array.isArray(p.guides) ? p.guides[0] : p.guides })),
    eventos: (eventos.data ?? []) as any[],
    cuota: Number(cfg.cuota_mensual ?? 3),
    resumen: {
      recaudadoMes: ((mes.data ?? []) as any[]).reduce((s, p) => s + Number(p.amount), 0),
      pendiente: vigentes.reduce((s, m) => s + Number(m.saldo_vencido), 0),
      enMora: vigentes.filter((m) => m.meses_mora >= 1).length,
      inactivos: lista.filter((m) => m.estado === 'inactivo_mora').length,
    },
  };
}
export type FinanzasData = Awaited<ReturnType<typeof cargarFinanzas>>;

/** Escapa un valor para CSV. */
export const csv = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
