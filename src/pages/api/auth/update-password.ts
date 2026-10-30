import type { APIRoute } from 'astro';
import { createServerSupabase } from '../../../lib/supabase-server';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');
  if (password.length < 8) return redirect('/reset-password?error=corta', 303);
  if (password !== confirm) return redirect('/reset-password?error=distinta', 303);

  const supabase = createServerSupabase(request, cookies);
  const { error } = (await supabase?.auth.updateUser({ password })) ?? { error: new Error('config') };
  if (error) return redirect('/reset-password?error=fallo', 303);
  return redirect('/socio?msg=clave', 303);
};
