import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabase';
import { json } from '../../../../lib/http';

export const prerender = false;

const MAX = 10 * 1024 * 1024;
const TIPOS: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// URL firmada de un solo uso para subir la boleta o comprobante al bucket privado "comprobantes".
export const POST: APIRoute = async ({ request }) => {
  if (!supabaseAdmin) return json({ error: 'Servicio no configurado.' }, 503);
  const b = await request.json().catch(() => ({}));
  const ext = TIPOS[String(b.contentType ?? '')];
  if (!ext) return json({ error: 'El comprobante debe ser PDF o una imagen JPG, PNG o WebP.' }, 400);
  if (!(Number(b.size) > 0) || Number(b.size) > MAX) return json({ error: 'El comprobante no puede pesar más de 10 MB.' }, 400);

  const path = `${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabaseAdmin.storage.from('comprobantes').createSignedUploadUrl(path);
  if (error || !data) { console.error('createSignedUploadUrl(comprobantes):', error?.message); return json({ error: 'No pudimos preparar la subida.' }, 500); }
  return json({ path, token: data.token });
};
