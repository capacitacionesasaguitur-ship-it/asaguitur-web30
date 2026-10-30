import type { APIRoute } from 'astro';
import { createServerSupabase } from '../../../lib/supabase-server';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  await createServerSupabase(request, cookies)?.auth.signOut();
  return redirect('/login?ok=salio', 303);
};
