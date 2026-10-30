import type { SupabaseClient } from '@supabase/supabase-js';

export interface Member {
  id: string; full_name: string; carnet: string; rnt: string; photo_url: string | null;
  languages: string[]; specialties: string[]; department: string; whatsapp: string; bio: string | null;
  active: boolean; member_since: string | null; valid_until: string | null;
  finance_status: 'al_dia' | 'pendiente' | 'en_mora'; email: string | null;
  estado: 'pendiente' | 'activo' | 'inactivo_mora' | 'baja';
}
export interface Payment {
  id: string; concept: 'cuota' | 'evento' | 'otro'; description: string; amount: number; status: string;
  paid_at: string | null; created_at: string; fecha_pago: string | null; referencia: string | null;
  recibo_numero: string | null; saldo_despues: number | null; anulado_motivo: string | null;
}
export interface Cuota { periodo: string; monto: number; pagado: number }
export interface Cuenta { saldo_total: number; saldo_vencido: number; meses_mora: number; saldo_a_favor: number }
export interface DocumentItem { id: string; title: string; description: string | null; category: string; keywords: string | null; file_size: number | null; created_at: string }
export interface EventItem {
  id: string; title: string; summary: string | null; agenda: string | null; speaker: string | null; location: string | null;
  starts_at: string; ends_at: string | null; capacity: number; price_member: number; seats_left: number;
}
export interface Registration { event_id: string; status: 'pending' | 'confirmed' | 'cancelled' }

export interface MemberData {
  member: Member | null;
  payments: Payment[]; cuotas: Cuota[]; cuenta: Cuenta | null; documents: DocumentItem[]; events: EventItem[]; registrations: Registration[];
}

/** Todo se lee con la sesión del socio: Supabase (RLS) decide qué puede ver. */
export async function loadMember(supabase: SupabaseClient): Promise<MemberData> {
  const [ov, pay, docs, evs, regs, cuo, cta] = await Promise.all([
    supabase.rpc('member_overview'),
    supabase.from('payments').select('id, concept, description, amount, status, paid_at, created_at, fecha_pago, referencia, recibo_numero, saldo_despues, anulado_motivo')
      .not('recibo_numero', 'is', null).order('created_at', { ascending: false }),
    supabase.from('documents').select('id, title, description, category, keywords, file_size, created_at').order('created_at', { ascending: false }),
    supabase.from('events_with_seats').select('id, title, summary, agenda, speaker, location, starts_at, ends_at, capacity, price_member, seats_left')
      .gte('starts_at', new Date().toISOString()).order('starts_at'),
    supabase.from('event_registrations').select('event_id, status'),
    supabase.from('cuotas').select('periodo, monto, pagado').order('periodo'),
    supabase.rpc('mi_cuenta'),
  ]);
  for (const r of [ov, pay, docs, evs, regs, cuo, cta]) if (r.error) console.error('loadMember:', r.error.message);

  const member = ((Array.isArray(ov.data) ? ov.data[0] : ov.data) ?? null) as Member | null;
  return {
    member,
    payments: ((pay.data ?? []) as Payment[]).map((p) => ({ ...p, amount: Number(p.amount), saldo_despues: p.saldo_despues === null ? null : Number(p.saldo_despues) })),
    cuotas: ((cuo.data ?? []) as Cuota[]).map((c) => ({ ...c, monto: Number(c.monto), pagado: Number(c.pagado) })),
    cuenta: (() => { const r = (Array.isArray(cta.data) ? cta.data[0] : cta.data) as Cuenta | null; return r ? {
      saldo_total: Number(r.saldo_total), saldo_vencido: Number(r.saldo_vencido), meses_mora: Number(r.meses_mora), saldo_a_favor: Number(r.saldo_a_favor) } : null; })(),
    documents: (docs.data ?? []) as DocumentItem[],
    events: ((evs.data ?? []) as EventItem[]).map((e) => ({ ...e, price_member: Number(e.price_member) })),
    registrations: (regs.data ?? []) as Registration[],
  };
}
