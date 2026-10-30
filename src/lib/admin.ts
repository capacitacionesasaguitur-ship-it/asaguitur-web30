import { supabaseAdmin } from './supabase';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Deja constancia de quién hizo qué en el panel. Nunca debe romper la acción principal. */
export async function audit(adminId: string, action: string, target: string, detail: object = {}) {
  try { await supabaseAdmin?.from('admin_audit_log').insert({ admin_id: adminId, action, target, detail }); }
  catch (e) { console.error('audit:', e); }
}
