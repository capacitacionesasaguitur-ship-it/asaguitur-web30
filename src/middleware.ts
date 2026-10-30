import { defineMiddleware } from 'astro:middleware';
import { createServerSupabase } from './lib/supabase-server';
import { json } from './lib/http';

const PROTEGIDAS = [/^\/socio(\/|$)/, /^\/reset-password\/?$/, /^\/api\/member(\/|$)/, /^\/admin(\/|$)/, /^\/api\/admin(\/|$)/];
const SOLO_JUNTA = [/^\/admin(\/|$)/, /^\/api\/admin(\/|$)/];
// Finanzas: la Junta y también el tesorero o asistente (rol "tesorero" en public.admins)
const FINANZAS = [/^\/admin\/finanzas(\/|$)/, /^\/api\/admin\/finanzas(\/|$)/];

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  if (!PROTEGIDAS.some((r) => r.test(pathname))) return next();

  const api = pathname.startsWith('/api/');

  // Defensa extra contra CSRF: una petición que cambia datos debe venir de este mismo sitio
  if (api && ctx.request.method !== 'GET') {
    const origin = ctx.request.headers.get('origin');
    if (origin && new URL(origin).host !== ctx.url.host) return json({ error: 'Origen no permitido.' }, 403);
  }

  const supabase = createServerSupabase(ctx.request, ctx.cookies);
  if (!supabase) return api ? json({ error: 'Servicio no configurado.' }, 503) : ctx.redirect('/login?error=config');

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return api ? json({ error: 'Sesión vencida. Vuelve a iniciar sesión.' }, 401)
               : ctx.redirect(`/login?next=${encodeURIComponent(pathname + ctx.url.search)}`);
  }
  ctx.locals.supabase = supabase;
  ctx.locals.user = data.user;

  // Panel de administración: solo usuarios registrados en public.admins.
  //   rol "junta"    → todo el panel
  //   rol "tesorero" → únicamente Finanzas
  if (SOLO_JUNTA.some((r) => r.test(pathname))) {
    const { data: rol } = await supabase.rpc('admin_role');
    if (rol !== 'junta' && rol !== 'tesorero') {
      return api ? json({ error: 'Acceso restringido a la Junta Directiva.' }, 403) : ctx.redirect('/socio');
    }
    const finanzas = FINANZAS.some((r) => r.test(pathname));
    if (rol === 'tesorero' && !finanzas) {
      return api ? json({ error: 'Tu rol solo permite el módulo de finanzas.' }, 403) : ctx.redirect('/admin/finanzas');
    }
    ctx.locals.isAdmin = true;
    ctx.locals.adminRole = rol;
  }

  const res = await next();
  try {
    res.headers.set('Cache-Control', 'private, no-store');
    if (SOLO_JUNTA.some((r) => r.test(pathname))) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  } catch { /* respuesta inmutable */ }
  return res;
});
