export const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** Evita "open redirect": solo rutas internas. */
export const safeNext = (v: unknown, fallback = '/socio'): string => {
  const s = String(v ?? '');
  return s.startsWith('/') && !s.startsWith('//') && !s.includes('\\') ? s : fallback;
};
