import type { APIRoute } from 'astro';
import { getCarnet, isExpired } from '../../../lib/carnet';

export const prerender = false;
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers });

// GET /api/verify/<id>  → estado en vivo; para socios inactivos no se devuelven datos personales
export const GET: APIRoute = async ({ params }) => {
  try {
    const c = params.id ? await getCarnet(params.id) : null;
    if (!c) return reply({ valid: false, reason: 'not_found' }, 404);
    if (!c.active) return reply({ valid: false, reason: 'inactive' });
    if (isExpired(c)) return reply({ valid: false, reason: 'expired', valid_until: c.valid_until });
    return reply({
      valid: true, full_name: c.full_name, carnet: c.carnet, rnt: c.rnt,
      valid_until: c.valid_until, verified_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error(e);
    return reply({ error: 'unavailable' }, 503);
  }
};
