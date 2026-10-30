import type { APIRoute } from 'astro';
import { UUID_RE } from '../../../../lib/carnet';
import { reciboPdf } from '../../../../lib/finanzas';
import { supabaseAdmin } from '../../../../lib/supabase';

export const prerender = false;

// El socio descarga SOLO sus recibos: la política RLS de payments solo le deja ver los suyos.
export const GET: APIRoute = async ({ params, locals }) => {
  const id = params.id ?? '';
  if (!supabaseAdmin || !UUID_RE.test(id)) return new Response('No encontrado', { status: 404 });
  const { data } = await locals.supabase.from('payments').select('id, recibo_numero').eq('id', id).maybeSingle();
  if (!data?.recibo_numero) return new Response('Recibo no encontrado', { status: 404 });
  const r = await reciboPdf(id);
  if (!r) return new Response('Recibo no encontrado', { status: 404 });
  return new Response(r.bytes as unknown as BodyInit, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Recibo-${r.numero}.pdf"`, 'Cache-Control': 'private, no-store' },
  });
};
