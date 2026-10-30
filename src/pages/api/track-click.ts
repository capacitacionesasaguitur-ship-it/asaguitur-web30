import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/supabase';

export const prerender = false;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { guide_id, source } = await request.json();
    if (typeof guide_id === 'string' && UUID.test(guide_id) && supabaseAdmin) {
      await supabaseAdmin.from('whatsapp_clicks').insert({ guide_id, source: String(source ?? '').slice(0, 120) });
    }
  } catch { /* el rastreo es opcional: nunca devolver error al visitante */ }
  return new Response(null, { status: 204 });
};
