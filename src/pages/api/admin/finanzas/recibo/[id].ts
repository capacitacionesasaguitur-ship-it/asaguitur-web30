import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { UUID_RE } from '../../../../../lib/carnet';
import { reciboPdf } from '../../../../../lib/finanzas';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const id = params.id ?? '';
  if (!supabaseAdmin || !UUID_RE.test(id)) return new Response('No encontrado', { status: 404 });
  const r = await reciboPdf(id);
  if (!r) return new Response('Recibo no encontrado', { status: 404 });
  return new Response(r.bytes as unknown as BodyInit, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Recibo-${r.numero}.pdf"`, 'Cache-Control': 'private, no-store' },
  });
};
