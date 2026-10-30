import QRCode from 'qrcode';
import { env } from './env';

/** URL pública de verificación que se codifica en el QR. */
export function carnetUrl(id: string, origin: string): string {
  const base = (env('PUBLIC_SITE_URL') ?? origin).replace(/\/$/, '');
  return `${base}/carnet/${id}`;
}

/** SVG vectorial (nítido al imprimir en el carné físico o en pantalla). */
export function makeQrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    color: { dark: '#191838', light: '#ffffff' },
  });
}
