import { supabaseAdmin } from './supabase';


export async function loadAdmin() {
  const a = supabaseAdmin!;
  const since = new Date(); since.setMonth(since.getMonth() - 11); since.setDate(1); since.setHours(0, 0, 0, 0);
  const rev = 'id, author_name, rating, comment, created_at, guides(full_name)';

  const [members, pending, approved, docs, events, regs, clicks, paid, news] = await Promise.all([
    a.from('admin_members').select('*').order('full_name'),
    a.from('reviews').select(rev).eq('status', 'pending').order('created_at'),
    a.from('reviews').select(rev).eq('status', 'approved').order('created_at', { ascending: false }).limit(20),
    a.from('documents').select('id, title, category, published, file_size, created_at').order('created_at', { ascending: false }).limit(50),
    a.from('events').select('id, title, starts_at, capacity, price_member, published').order('starts_at', { ascending: false }).limit(30),
    a.from('event_registrations').select('event_id, status'),
    a.from('admin_clicks').select('*').order('last_30d', { ascending: false }),
    a.from('payments').select('id, concept, event_id, description, amount, fecha_pago, guides(full_name)').eq('status', 'paid').not('recibo_numero', 'is', null)
      .gte('fecha_pago', since.toLocaleDateString('en-CA')).order('fecha_pago', { ascending: false }),
    a.from('newsletters').select('id, kind, subject, status, recipients_count, sent_count, failed_count, created_at').order('created_at', { ascending: false }).limit(15),
  ]);
  for (const r of [members, pending, approved, docs, events, regs, clicks, paid, news]) if (r.error) console.error('loadAdmin:', r.error.message);

  const paidRows = ((paid.data ?? []) as any[]).map((p) => ({ ...p, amount: Number(p.amount) }));

  // Ingresos por mes (últimos 12, incluye meses en cero)
  const byMonth = new Map<string, number>();
  for (let i = 0; i < 12; i++) { const d = new Date(since); d.setMonth(since.getMonth() + i); byMonth.set(d.toLocaleDateString('en-CA').slice(0, 7), 0); }
  for (const p of paidRows) { const k = String(p.fecha_pago).slice(0, 7); byMonth.set(k, (byMonth.get(k) ?? 0) + p.amount); }

  const total = (c: string) => paidRows.filter((p) => p.concept === c).reduce((s, p) => s + p.amount, 0);
  const eventStats = ((events.data ?? []) as any[]).map((e) => ({
    ...e,
    confirmed: ((regs.data ?? []) as any[]).filter((r) => r.event_id === e.id && r.status === 'confirmed').length,
    revenue: paidRows.filter((p) => p.event_id === e.id).reduce((s, p) => s + p.amount, 0),
  }));

  return {
    members: (members.data ?? []) as any[],
    pending: (pending.data ?? []) as any[], approved: (approved.data ?? []) as any[],
    documents: (docs.data ?? []) as any[], events: ((events.data ?? []) as any[]),
    clicks: (clicks.data ?? []) as any[],
    paid: paidRows, monthly: [...byMonth.entries()].map(([month, amount]) => ({ month, amount })),
    totals: { cuotas: total('cuota'), eventos: total('evento') }, eventStats,
    newsletters: (news.data ?? []) as any[],
  };
}
export type AdminData = Awaited<ReturnType<typeof loadAdmin>>;
