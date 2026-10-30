import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabase';
import { json } from '../../../../lib/http';
import { selectRecipients, type Kind } from '../../../../lib/recipients';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!supabaseAdmin) return json({ error: 'Servicio no configurado.' }, 503);
  const b = await request.json().catch(() => ({}));
  const kind: Kind = b.kind === 'recordatorio' ? 'recordatorio' : 'boletin';
  try {
    const { recipients, sinCorreo } = await selectRecipients(kind, b.estados, b.incluirInactivos === true);
    return json({ count: recipients.length, recipients: recipients.map((r) => ({ name: r.name, email: r.email, estado: r.finance_status })), sinCorreo });
  } catch (e) {
    console.error('preview:', e);
    return json({ error: 'No pudimos calcular los destinatarios.' }, 500);
  }
};
