import type { APIRoute } from 'astro';
import { createServerSupabase } from '../../../lib/supabase-server';

export const prerender = false;

// Siempre responde igual, exista o no el correo (evita revelar quién es socio).
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (email.includes('@') && email.length < 255) {
    const supabase = createServerSupabase(request, cookies);
    const { error } = (await supabase?.auth.resetPasswordForEmail(email)) ?? {};
    if (error) console.error('resetPasswordForEmail:', error.message);
  }
  return redirect('/login?modo=recuperar&ok=enviado', 303);
};
