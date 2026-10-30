import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase';
import { json } from '../../../lib/http';
import { UUID_RE } from '../../../lib/carnet';
import { audit } from '../../../lib/admin';

export const prerender = false;
const CATEGORIAS = ['leyes', 'sitios', 'mapas_manuales'];

export const POST: APIRoute = async ({ request, locals }) => {
  if (!supabaseAdmin) return json({ error: 'Servicio no configurado.' }, 503);
  const b = await request.json().catch(() => ({}));
  const id = String(b.id ?? '');
  if (!UUID_RE.test(id)) return json({ error: 'Documento no válido.' }, 400);

  // Publicar u ocultar
  if (b.action === 'toggle') {
    const { error } = await supabaseAdmin.from('documents').update({ published: b.published === true }).eq('id', id);
    if (error) return json({ error: 'No pudimos actualizar el documento.' }, 500);
    await audit(locals.user.id, 'document.toggle', id, { published: b.published === true });
    return json({ ok: true });
  }

  // Registrar un PDF que el navegador ya subió con la URL firmada
  const title = String(b.title ?? '').trim();
  const category = String(b.category ?? '');
  if (title.length < 3 || title.length > 160) return json({ error: 'El título debe tener entre 3 y 160 caracteres.' }, 400);
  if (!CATEGORIAS.includes(category)) return json({ error: 'Elige una categoría.' }, 400);

  const file = `${id}.pdf`;
  const { data: objs } = await supabaseAdmin.storage.from('documents').list('', { search: file, limit: 5 });
  const obj = objs?.find((o) => o.name === file);
  if (!obj) return json({ error: 'No encontramos el archivo subido. Vuelve a intentarlo.' }, 400);

  const { error } = await supabaseAdmin.from('documents').insert({
    id, title, category, file_path: file,
    description: String(b.description ?? '').trim().slice(0, 600) || null,
    keywords: String(b.keywords ?? '').trim().slice(0, 300) || null,
    file_size: Number((obj.metadata as any)?.size ?? 0) || null,
    published: b.published !== false,
  });
  if (error) { console.error('documents insert:', error.message); return json({ error: 'No pudimos guardar el documento.' }, 500); }
  await audit(locals.user.id, 'document.create', id, { title, category });
  return json({ ok: true });
};
