import type { APIRoute } from 'astro';
import { createServerSupabase } from '../../../lib/supabase-server';
import { safeNext } from '../../../lib/http';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  const next = safeNext(form.get('next'));

  const supabase = createServerSupabase(request, cookies);
  if (!supabase) return redirect('/login?error=config', 303);

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return redirect(`/login?error=credenciales&next=${encodeURIComponent(next)}`, 303);
  return redirect(next, 303);
};
