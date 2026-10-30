import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { json } from '../../../lib/http';

export const prerender = false;
const MAX = 1_500_000; // el navegador ya la reduce a 512×512 JPEG (~100 KB)

export const POST: APIRoute = async ({ locals, request }) => {
  if (!supabaseAdmin) return json({ error: 'El servicio de fotos aún no está configurado.' }, 503);
  const { data } = await locals.supabase.rpc('member_overview');
  const m = Array.isArray(data) ? data[0] : data;
  if (!m) return json({ error: 'Tu usuario todavía no está vinculado a un perfil de socio.' }, 403);

  const file = (await request.formData()).get('photo');
  if (!(file instanceof File) || file.size === 0 || file.size > MAX) return json({ error: 'La foto debe pesar menos de 1.5 MB.' }, 400);

  const buf = Buffer.from(await file.arrayBuffer());
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) return json({ error: 'El archivo debe ser una imagen JPG.' }, 400);  // firma JPEG

  const path = `${m.id}/avatar.jpg`;
  const up = await supabaseAdmin.storage.from('avatars').upload(path, buf, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
  if (up.error) { console.error('avatar upload:', up.error.message); return json({ error: 'No pudimos subir la foto.' }, 500); }

  const photo_url = `${supabaseAdmin.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;  // ?v= rompe la caché
  const { error } = await supabaseAdmin.from('guides').update({ photo_url }).eq('id', m.id);
  if (error) { console.error(error.message); return json({ error: 'No pudimos guardar la foto.' }, 500); }
  return json({ ok: true, photo_url });
};
