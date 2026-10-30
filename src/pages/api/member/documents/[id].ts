import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabase';
import { UUID_RE } from '../../../../lib/carnet';

export const prerender = false;

// ?mode=view     → el servidor entrega el PDF (para el visor incrustado; archivos hasta ~5 MB)
// ?mode=download → descarga directa      |  sin modo → abre en pestaña nueva
export const GET: APIRoute = async ({ params, url, locals }) => {
  const id = params.id ?? '';
  if (!UUID_RE.test(id) || !supabaseAdmin) return new Response('No encontrado', { status: 404 });

  // La consulta pasa por RLS: solo devuelve fila si el socio está activo y el documento publicado
  const { data: doc } = await locals.supabase.from('documents').select('title, file_path').eq('id', id).maybeSingle();
  if (!doc) return new Response('No encontrado', { status: 404 });

  const mode = url.searchParams.get('mode');
  const filename = `${doc.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').slice(0, 80)}.pdf`;

  if (mode === 'view') {
    const { data: blob, error } = await supabaseAdmin.storage.from('documents').download(doc.file_path);
    if (error || !blob) return new Response('Archivo no disponible', { status: 404 });
    return new Response(await blob.arrayBuffer(), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const { data, error } = await supabaseAdmin.storage.from('documents')
    .createSignedUrl(doc.file_path, 120, mode === 'download' ? { download: filename } : undefined);
  if (error || !data) return new Response('Archivo no disponible', { status: 404 });
  return Response.redirect(data.signedUrl, 302);
};
