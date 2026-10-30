import type { APIRoute } from 'astro';
import { UUID_RE } from '../../../lib/carnet';
import { carnetUrl, makeQrSvg } from '../../../lib/qr';

export const prerender = false;

// /carnet/<id>/qr.svg  → imagen   |   /carnet/<id>/qr.svg?download → descarga
export const GET: APIRoute = async ({ params, url }) => {
  const id = params.id ?? '';
  if (!UUID_RE.test(id)) return new Response('No encontrado', { status: 404 });
  const headers: Record<string, string> = {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=86400', // el QR solo depende del id, no del estado
  };
  if (url.searchParams.has('download')) headers['Content-Disposition'] = `attachment; filename="qr-carnet-${id}.svg"`;
  return new Response(await makeQrSvg(carnetUrl(id, url.origin)), { headers });
};
