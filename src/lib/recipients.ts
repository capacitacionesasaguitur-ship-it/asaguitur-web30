import { supabaseAdmin } from './supabase';

export type Kind = 'boletin' | 'recordatorio';
export interface Recipient { guide_id: string | null; email: string; name: string; finance_status?: string }

const ESTADOS = ['pendiente', 'en_mora'];

export async function selectRecipients(kind: Kind, estados: unknown, incluirInactivos: boolean) {
  const filtro = (Array.isArray(estados) ? estados : []).filter((e) => ESTADOS.includes(e));
  let q = supabaseAdmin!.from('admin_members').select('id, full_name, email, active, finance_status');
  if (!incluirInactivos) q = q.eq('active', true);
  if (kind === 'recordatorio') q = q.in('finance_status', filtro.length ? filtro : ESTADOS);
  const { data, error } = await q.order('full_name');
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return {
    recipients: rows.filter((r) => r.email).map((r): Recipient => ({
      guide_id: r.id, email: r.email, name: r.full_name, finance_status: r.finance_status,
    })),
    sinCorreo: rows.filter((r) => !r.email).map((r) => r.full_name as string),
  };
}
