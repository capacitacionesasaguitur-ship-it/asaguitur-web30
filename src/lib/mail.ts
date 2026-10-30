const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function paragraphs(message: string): string {
  return esc(message.trim()).split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${p.replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#191838">$1</a>')}</p>`)
    .join('');
}

export interface MailInput {
  name: string;                                              // primer nombre del socio
  message: string;                                           // texto plano escrito por la Junta
  button?: { label: string; url: string };
  attachment?: { url: string; name: string; kind: 'pdf' | 'image' };
  logoUrl?: string;                                          // URL pública del logo (versión liviana)
}

export function renderEmail(i: MailInput): { html: string; text: string } {
  const btn = (label: string, url: string, bg: string) =>
    `<p style="margin:20px 0"><a href="${esc(url)}" style="display:inline-block;background:${bg};color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:10px">${esc(label)}</a></p>`;

  const att = !i.attachment ? '' : i.attachment.kind === 'image'
    ? `<p style="margin:18px 0"><img src="${esc(i.attachment.url)}" alt="${esc(i.attachment.name)}" style="max-width:100%;height:auto;border-radius:8px"></p>`
    : btn(`Descargar ${i.attachment.name}`, i.attachment.url, '#191838');

  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f5f5fa;font-family:Arial,Helvetica,sans-serif;color:#191838">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#ffffff;padding:18px 24px 14px" align="left">${i.logoUrl ? `<img src="${esc(i.logoUrl)}" alt="ASAGUITUR, Asociación Salvadoreña de Guías Turísticos" width="220" style="display:block;width:220px;max-width:100%;height:auto;border:0">` : `<div style="font-size:20px;font-weight:bold;color:#191838">ASAGUITUR</div>`}</td></tr>
<tr><td style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="5" style="background:#ffe529;font-size:0;line-height:0">&nbsp;</td><td height="5" style="background:#c8cf67;font-size:0;line-height:0">&nbsp;</td><td height="5" style="background:#268dc7;font-size:0;line-height:0">&nbsp;</td><td height="5" style="background:#ca176b;font-size:0;line-height:0">&nbsp;</td><td height="5" style="background:#7b2a65;font-size:0;line-height:0">&nbsp;</td><td height="5" style="background:#191838;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:24px"><p style="margin:0 0 14px;font-size:16px">Hola ${esc(i.name)},</p>${paragraphs(i.message)}${i.button ? btn(i.button.label, i.button.url, '#ca176b') : ''}${att}</td></tr>
<tr><td style="padding:16px 24px;background:#f5f5fa;font-size:12px;color:#55557a">Recibes este correo por ser socio de ASAGUITUR. Si tienes dudas, responde a este mensaje o comunícate con la Junta Directiva.</td></tr>
</table></td></tr></table></body></html>`;

  const text = [`Hola ${i.name},`, '', i.message.trim(),
    i.button ? `\n${i.button.label}: ${i.button.url}` : '',
    i.attachment ? `\n${i.attachment.name}: ${i.attachment.url}` : '',
    '\n--\nASAGUITUR. Recibes este correo por ser socio de la asociación.'].join('\n');
  return { html, text };
}
