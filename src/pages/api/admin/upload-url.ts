import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { json } from '../../../lib/http';

export const prerender = false;

const MB = 1024 * 1024;
const REGLAS = {
  documents: { max: 20 * MB, tipos: { 'application/pdf': 'pdf' } as Record<string, string> },
  boletin: { max: 10 * MB, tipos: { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string> },
};

// Entrega una URL firmada de un solo uso para que el navegador suba el archivo directo a Storage.
export const POST: APIRoute = async ({ request }) => {
  if (!supabaseAdmin) return json({ error: 'Servicio no configurado.' }, 503);
  const b = await request.json().catch(() => ({}));
  const bucket = b.bucket as keyof typeof REGLAS;
  const regla = REGLAS[bucket];
  if (!regla) return json({ error: 'Destino no válido.' }, 400);

  const ext = regla.tipos[String(b.contentType ?? '')];
  if (!ext) return json({ error: bucket === 'documents' ? 'Solo se aceptan archivos PDF.' : 'Solo se aceptan PDF o imágenes JPG, PNG y WebP.' }, 400);
  if (!(Number(b.size) > 0) || Number(b.size) > regla.max) return json({ error: `El archivo no puede pesar más de ${regla.max / MB} MB.` }, 400);

  const id = crypto.randomUUID();
  const path = `${id}.${ext}`;
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) { console.error('createSignedUploadUrl:', error?.message); return json({ error: 'No pudimos preparar la subida.' }, 500); }
  return json({
    id, path, token: data.token,
    publicUrl: bucket === 'boletin' ? supabaseAdmin.storage.from('boletin').getPublicUrl(path).data.publicUrl : null,
  });
};
