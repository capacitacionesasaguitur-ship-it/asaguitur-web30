import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { json } from '../../../lib/http';
import { UUID_RE } from '../../../lib/carnet';
import { audit, EMAIL_RE } from '../../../lib/admin';

export const prerender = false;

// Altas y bajas (estado) y correo del socio. El estado "inactivo_mora" lo maneja solo el sistema.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!supabaseAdmin) return json({ error: 'Servicio no configurado.' }, 503);
  const b = await request.json().catch(() => ({}));
  const id = String(b.id ?? '');
  if (!UUID_RE.test(id)) return json({ error: 'Socio no válido.' }, 400);

  const patch: Record<string, unknown> = {};
  if (b.estado !== undefined) {
    if (b.estado !== 'activo' && b.estado !== 'baja') return json({ error: 'Estado no válido.' }, 400);
    patch.estado = b.estado;
    patch.baja_motivo = b.estado === 'baja' ? String(b.motivo ?? '').trim().slice(0, 300) || null : null;
  }
  if (b.email !== undefined) {
    const e = String(b.email).trim().toLowerCase();
    if (e === '') patch.email = null;
    else if (EMAIL_RE.test(e) && e.length < 255) patch.email = e;
    else return json({ error: 'El correo no es válido.' }, 400);
  }
  if (!Object.keys(patch).length) return json({ error: 'No hay cambios que guardar.' }, 400);

  const { data, error } = await supabaseAdmin.from('guides').update(patch).eq('id', id)
    .select('id, full_name, active, estado, email').maybeSingle();
  if (error) {
    if (error.code === '23505') return json({ error: 'Ese correo ya está asignado a otro socio.' }, 409);
    console.error('members update:', error.message);
    return json({ error: 'No pudimos guardar los cambios.' }, 500);
  }
  if (!data) return json({ error: 'Socio no encontrado.' }, 404);

  if (patch.email) await supabaseAdmin.rpc('link_member_by_email', { p_guide_id: id });   // si ya tiene usuario, se vincula
  await audit(locals.user.id, 'member.update', id, patch);
  return json({ ok: true, member: data });
};
