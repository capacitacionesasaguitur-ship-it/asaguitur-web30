import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '../../../../lib/supabase';
import { json } from '../../../../lib/http';
import { env, siteBase } from '../../../../lib/env';
import { audit } from '../../../../lib/admin';
import { renderEmail } from '../../../../lib/mail';
import { sendBatch, type OutgoingEmail } from '../../../../lib/resend';
import { selectRecipients, type Kind, type Recipient } from '../../../../lib/recipients';

export const prerender = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BOLETIN_PUBLIC = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/boletin\//;

export const POST: APIRoute = async ({ request, locals, url }) => {
  const admin = supabaseAdmin;
  if (!admin) return json({ error: 'Servicio no configurado.' }, 503);
  if (!env('RESEND_API_KEY') || !env('RESEND_FROM')) return json({ error: 'Resend aún no está configurado en el servidor.' }, 503);

  const b = await request.json().catch(() => ({}));
  const kind: Kind = b.kind === 'recordatorio' ? 'recordatorio' : 'boletin';
  const test = b.test === true;
  const subject = String(b.subject ?? '').trim();
  const message = String(b.message ?? '').trim();
  if (subject.length < 3 || subject.length > 150) return json({ error: 'El asunto debe tener entre 3 y 150 caracteres.' }, 400);
  if (message.length < 10 || message.length > 5000) return json({ error: 'El mensaje debe tener entre 10 y 5,000 caracteres.' }, 400);

  // Adjunto: solo archivos que la propia Junta subió al bucket público "boletin"
  let attachment: { url: string; name: string; kind: 'pdf' | 'image' } | undefined;
  if (b.attachment?.url) {
    const aUrl = String(b.attachment.url);
    if (!BOLETIN_PUBLIC.test(aUrl)) return json({ error: 'El adjunto no es válido.' }, 400);
    attachment = { url: aUrl, name: String(b.attachment.name ?? 'Documento').slice(0, 80), kind: aUrl.endsWith('.pdf') ? 'pdf' : 'image' };
  }

  // Destinatarios
  let recipients: Recipient[];
  if (test) recipients = [{ guide_id: null, email: locals.user.email!, name: 'Junta Directiva' }];
  else {
    try { recipients = (await selectRecipients(kind, b.estados, b.incluirInactivos === true)).recipients; }
    catch (e) { console.error(e); return json({ error: 'No pudimos calcular los destinatarios.' }, 500); }
  }
  if (!recipients.length) return json({ error: 'No hay destinatarios con correo para este envío.' }, 400);

  const base = siteBase(url.origin);
  const finalSubject = test ? `[PRUEBA] ${subject}` : subject;
  let newsletterId = crypto.randomUUID();

  if (!test) {
    // Evita el doble envío (doble clic o reintento): mismo contenido y mismos destinatarios en 10 minutos
    const fp = createHash('sha256').update(JSON.stringify([kind, subject, message, attachment?.url ?? '', recipients.map((r) => r.email).sort()])).digest('hex');
    const { data: dup } = await admin.from('newsletters').select('id').eq('fingerprint', fp)
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()).limit(1);
    if (dup?.length) return json({ error: 'Este mismo mensaje ya se envió hace pocos minutos. Revisa el historial.' }, 409);

    const { data: nl, error: nlErr } = await admin.from('newsletters').insert({
      kind, subject, body: message, attachment_url: attachment?.url ?? null, attachment_name: attachment?.name ?? null,
      fingerprint: fp, recipients_count: recipients.length, created_by: locals.user.id,
    }).select('id').single();
    if (nlErr || !nl) { console.error(nlErr?.message); return json({ error: 'No pudimos registrar el envío.' }, 500); }
    newsletterId = nl.id;
  }

  // Un correo por socio (personalizado), enviados por lotes de 100
  const mails: (OutgoingEmail & { r: Recipient })[] = recipients.map((r) => {
    const button = kind === 'recordatorio' ? { label: 'Ver mi estado de cuenta', url: `${base}/socio#pagos` } : undefined;
    const { html, text } = renderEmail({ name: r.name.split(' ')[0], message, button, attachment, logoUrl: `${base}/logo-email.png` });
    return { to: r.email, subject: finalSubject, html, text, r };
  });

  const results: { r: Recipient; status: 'sent' | 'failed'; resend_id?: string; error?: string }[] = [];
  for (let i = 0; i < mails.length; i += 100) {
    if (i > 0) await sleep(600);                                    // Resend permite 2 solicitudes por segundo
    const chunk = mails.slice(i, i + 100);
    const out = await sendBatch(chunk.map(({ r, ...m }) => m), `${newsletterId}-${i / 100}`);
    chunk.forEach((m, k) => results.push('error' in out
      ? { r: m.r, status: 'failed', error: out.error }
      : { r: m.r, status: 'sent', resend_id: out.ids[k] }));
  }
  const sent = results.filter((x) => x.status === 'sent').length;
  const failed = results.length - sent;
  const firstError = results.find((x) => x.error)?.error;

  if (test) return json(failed ? { error: firstError ?? 'No se pudo enviar la prueba.' } : { ok: true, sent: 1, test: true }, failed ? 502 : 200);

  await admin.from('newsletter_recipients').insert(results.map((x) => ({
    newsletter_id: newsletterId, guide_id: x.r.guide_id, email: x.r.email,
    status: x.status, resend_id: x.resend_id ?? null, error: x.error ?? null,
  })));
  await admin.from('newsletters').update({
    status: failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'partial', sent_count: sent, failed_count: failed, sent_at: new Date().toISOString(),
  }).eq('id', newsletterId);
  await audit(locals.user.id, 'newsletter.send', newsletterId, { kind, subject, sent, failed });

  return json({ ok: failed === 0, sent, failed, error: firstError });
};
