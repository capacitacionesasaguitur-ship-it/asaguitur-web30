import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { UUID_RE } from '../../../../../lib/carnet';

export const prerender = false;

// Abre el comprobante del banco con un enlace firmado que vence a los 2 minutos.
export const GET: APIRoute = async ({ params, redirect }) => {
  const id = params.id ?? '';
  if (!supabaseAdmin || !UUID_RE.test(id)) return new Response('No encontrado', { status: 404 });
  const { data: p } = await supabaseAdmin.from('payments').select('comprobante_path').eq('id', id).maybeSingle();
  if (!p?.comprobante_path) return new Response('Este pago no tiene comprobante adjunto.', { status: 404 });
  const { data, error } = await supabaseAdmin.storage.from('comprobantes').createSignedUrl(p.comprobante_path, 120);
  if (error || !data) return new Response('No pudimos abrir el comprobante.', { status: 500 });
  return redirect(data.signedUrl, 302);
};
