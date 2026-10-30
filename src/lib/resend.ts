import { env } from './env';

export interface OutgoingEmail { to: string; subject: string; html: string; text: string }

/**
 * Envío por lotes (POST /emails/batch): hasta 100 correos por llamada, todo o nada.
 * El endpoint por lotes de Resend no admite adjuntos, por eso los boletines enlazan el archivo.
 */
export async function sendBatch(msgs: OutgoingEmail[], idempotencyKey: string): Promise<{ ids: string[] } | { error: string }> {
  const key = env('RESEND_API_KEY');
  const from = env('RESEND_FROM');
  if (!key || !from) return { error: 'Resend no está configurado (faltan RESEND_API_KEY o RESEND_FROM).' };
  const replyTo = env('RESEND_REPLY_TO');

  const res = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,             // si se reintenta con la misma clave, Resend no reenvía
      'User-Agent': 'asaguitur-web/1.0',
    },
    body: JSON.stringify(msgs.map((m) => ({
      from, to: [m.to], subject: m.subject, html: m.html, text: m.text, ...(replyTo ? { reply_to: replyTo } : {}),
    }))),
  });
  const j = await res.json().catch(() => ({} as any));
  if (!res.ok) return { error: `Resend ${res.status}: ${j.message ?? 'error desconocido'}` };
  return { ids: ((j.data ?? []) as { id: string }[]).map((d) => d.id) };
}

export interface OneEmail extends OutgoingEmail { attachments?: { filename: string; content: string /* base64 */ }[] }

/** Envío individual (POST /emails): admite adjuntos, a diferencia del envío por lotes. */
export async function sendOne(msg: OneEmail, idempotencyKey: string): Promise<{ id: string } | { error: string }> {
  const key = env('RESEND_API_KEY');
  const from = env('RESEND_FROM');
  if (!key || !from) return { error: 'Resend no está configurado (faltan RESEND_API_KEY o RESEND_FROM).' };
  const replyTo = env('RESEND_REPLY_TO');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey, 'User-Agent': 'asaguitur-web/1.0',
    },
    body: JSON.stringify({
      from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text,
      ...(replyTo ? { reply_to: replyTo } : {}), ...(msg.attachments?.length ? { attachments: msg.attachments } : {}),
    }),
  });
  const j = await res.json().catch(() => ({} as any));
  if (!res.ok) return { error: `Resend ${res.status}: ${j.message ?? 'error desconocido'}` };
  return { id: String(j.id ?? '') };
}
