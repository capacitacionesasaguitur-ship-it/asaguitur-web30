import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';
import { env, supabaseUrl } from './env';

/** Cliente de Supabase ligado a la sesión del navegador (cookies). null si falta configuración. */
export function createServerSupabase(request: Request, cookies: AstroCookies) {
  const url = supabaseUrl();
  const anon = env('PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !anon) return null;
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => parseCookieHeader(request.headers.get('Cookie') ?? '').map((c) => ({ name: c.name, value: c.value ?? '' })),
      setAll: (list) =>
        list.forEach(({ name, value, options }) =>
          cookies.set(name, value, { ...options, httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax', path: '/' })),
    },
  });
}
