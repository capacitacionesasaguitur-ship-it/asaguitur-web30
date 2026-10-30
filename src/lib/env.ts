/** Lee una variable de entorno; quita espacios y comillas sobrantes (error común al copiar y pegar). */
export const env = (k: string): string | undefined => {
  const raw = process.env[k] ?? (import.meta.env as Record<string, string | undefined>)[k];
  if (typeof raw !== 'string') return undefined;
  return raw.trim().replace(/^['"]+|['"]+$/g, '').trim() || undefined;
};

/** Dirección válida de un proyecto de Supabase (https://xxxx.supabase.co). Evita que una URL mal copiada tumbe el sitio. */
export const supabaseUrl = (): string | undefined => {
  const u = env('PUBLIC_SUPABASE_URL');
  if (!u) return undefined;
  try { if (new URL(u).protocol === 'https:') return u.replace(/\/$/, ''); } catch { /* cae al aviso */ }
  console.error('PUBLIC_SUPABASE_URL no es una dirección válida. Debe verse como https://xxxx.supabase.co (sin espacios ni comillas).');
  return undefined;
};

/** URL pública del sitio, sin barra final. */
export const siteBase = (origin: string): string => (env('PUBLIC_SITE_URL') ?? origin).replace(/\/$/, '');
