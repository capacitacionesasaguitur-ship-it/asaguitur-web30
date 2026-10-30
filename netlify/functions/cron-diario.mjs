// Tarea programada de Netlify: cada día a las 14:00 UTC (8:00 a. m. en El Salvador) llama a /api/cron/diario.
// Requiere las variables PUBLIC_SITE_URL y CRON_SECRET (la misma en el sitio y aquí).
export default async () => {
  const base = (process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
  const secret = process.env.CRON_SECRET || '';
  if (!base || !secret) { console.error('cron-diario: faltan PUBLIC_SITE_URL o CRON_SECRET'); return; }
  const res = await fetch(`${base}/api/cron/diario`, { method: 'POST', headers: { 'x-cron-secret': secret } });
  console.log('cron-diario:', res.status, await res.text());
};

export const config = { schedule: '0 14 * * *' };
