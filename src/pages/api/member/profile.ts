import type { APIRoute } from 'astro';
import { json } from '../../../lib/http';

export const prerender = false;

const ERRORES: Record<string, string> = {
  bio_larga: 'La biografía no puede pasar de 1,000 caracteres.',
  whatsapp_invalido: 'El WhatsApp debe tener entre 8 y 15 dígitos.',
  idiomas_invalidos: 'Elige al menos un idioma (máximo 12).',
  especialidades_invalidas: 'Elige al menos una especialidad (máximo 12).',
  sin_perfil: 'Tu usuario todavía no está vinculado a un perfil de socio.',
};
const clean = (v: unknown): string[] =>
  [...new Set((Array.isArray(v) ? v : []).map((x) => String(x).trim().slice(0, 40)).filter(Boolean))];

export const POST: APIRoute = async ({ locals, request }) => {
  const b = await request.json().catch(() => ({}));
  let phone = String(b.whatsapp ?? '').replace(/\D/g, '');
  if (phone.length === 8) phone = '503' + phone;                       // número salvadoreño sin código de país

  const { error } = await locals.supabase.rpc('update_my_profile', {
    p_bio: String(b.bio ?? '').slice(0, 1200),
    p_languages: clean(b.languages),
    p_specialties: clean(b.specialties),
    p_whatsapp: phone,
  });
  if (error) {
    const code = Object.keys(ERRORES).find((k) => error.message.includes(k));
    if (!code) console.error('update_my_profile:', error.message);
    return json({ error: code ? ERRORES[code] : 'No pudimos guardar tus cambios.' }, code ? 400 : 500);
  }
  return json({ ok: true, whatsapp: phone });
};
