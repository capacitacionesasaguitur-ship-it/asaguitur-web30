import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont } from 'pdf-lib';
import { supabaseAdmin } from './supabase';
import { LOGO_PNG_BASE64 } from './recibo-logo';

// Datos fijos de la asociación (salen de la escritura, el NIT y el sitio anterior). Si cambian, se editan aquí.
const ASOCIACION = {
  nombre: 'Asociación Salvadoreña de Guías Turísticos (ASAGUITUR)',
  nit: '0614-241114-107-2',
  domicilio: 'San Salvador, El Salvador',
  contacto: 'info.asaguitur@gmail.com  ·  Tel. 2273-3956 / 7179-1503',
};

export interface ReciboData {
  numero: string;
  fechaEmision: string;           // YYYY-MM-DD
  fechaPago: string;              // YYYY-MM-DD
  socio: { nombre: string; carnet: string };
  concepto: string;
  monto: number;
  referencia: string | null;
  observaciones: string | null;
  saldoDespues: number | null;    // negativo = saldo a favor
  firmante: { nombre: string; cargo: string };
  anulado: { motivo: string; fecha: string } | null;
}

// ---------- utilidades de texto ----------
const MAPA: Record<string, string> = { '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '•': '*', '·': '·' };
/** Las fuentes estándar del PDF solo entienden Latin-1: se quitan los demás caracteres. */
const w = (s: string) => s.replace(/[^\x20-\xFF]/g, (c) => MAPA[c] ?? '').replace(/[\x7F-\x9F]/g, '');

const UNI = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce',
  'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro',
  'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DEC = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CEN = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function menorDeMil(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100), r = n % 100, p: string[] = [];
  if (c) p.push(CEN[c]);
  if (r) {
    if (r < 30) p.push(UNI[r]);
    else { const d = Math.floor(r / 10), u = r % 10; p.push(u ? `${DEC[d]} y ${UNI[u]}` : DEC[d]); }
  }
  return p.join(' ');
}
const apocopar = (s: string) => s.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');

/** 3.5 → "tres dólares con 50/100" */
export function montoEnLetras(monto: number): string {
  const total = Math.round(monto * 100);
  const ent = Math.floor(total / 100), cen = total % 100;
  let txt: string;
  if (ent === 0) txt = 'cero';
  else {
    const mil = Math.floor(ent / 1000), resto = ent % 1000, p: string[] = [];
    if (mil) p.push(mil === 1 ? 'mil' : `${apocopar(menorDeMil(mil))} mil`);
    if (resto) p.push(menorDeMil(resto));
    txt = apocopar(p.join(' '));
  }
  return `${txt} ${ent === 1 ? 'dólar' : 'dólares'} con ${String(cen).padStart(2, '0')}/100`;
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (iso: string) =>
  new Intl.DateTimeFormat('es-SV', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));

function envolver(texto: string, font: PDFFont, size: number, ancho: number): string[] {
  const out: string[] = [];
  let linea = '';
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const prueba = linea ? `${linea} ${palabra}` : palabra;
    if (font.widthOfTextAtSize(prueba, size) > ancho && linea) { out.push(linea); linea = palabra; } else linea = prueba;
  }
  if (linea) out.push(linea);
  return out;
}

// ---------- imágenes privadas (firma y sello) ----------
// No se guardan en el repositorio: viven en el bucket privado "recibos-assets" de Supabase.
const cache = new Map<string, Uint8Array | null>();
async function activoPrivado(nombre: 'firma.png' | 'sello.png'): Promise<Uint8Array | null> {
  if (cache.has(nombre)) return cache.get(nombre)!;
  let bytes: Uint8Array | null = null;
  try {
    const { data, error } = await supabaseAdmin!.storage.from('recibos-assets').download(nombre);
    if (!error && data) bytes = new Uint8Array(await data.arrayBuffer());
    else console.error(`recibos-assets/${nombre}:`, error?.message);
  } catch (e) { console.error('activoPrivado:', e); }
  cache.set(nombre, bytes);
  return bytes;
}

// ---------- el PDF ----------
export async function crearReciboPdf(d: ReciboData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Recibo ${d.numero}`);
  pdf.setAuthor('ASAGUITUR');
  const page = pdf.addPage([612, 792]);                         // carta
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  const navy = rgb(0.098, 0.094, 0.22), magenta = rgb(0.792, 0.09, 0.42), gris = rgb(0.38, 0.38, 0.48), linea = rgb(0.86, 0.86, 0.92);
  const M = 50, W = 612 - 2 * M;
  const texto = (t: string, x: number, y: number, size = 10, font = normal, color = navy) => page.drawText(w(t), { x, y, size, font, color });
  const derecha = (t: string, xDer: number, y: number, size = 10, font = normal, color = navy) =>
    page.drawText(w(t), { x: xDer - font.widthOfTextAtSize(w(t), size), y, size, font, color });

  // Franja de colores de la marca
  const franja = [rgb(1, 0.898, 0.161), rgb(0.784, 0.812, 0.404), rgb(0.149, 0.553, 0.78), magenta, rgb(0.482, 0.165, 0.396), navy];
  franja.forEach((c, i) => page.drawRectangle({ x: (612 / 6) * i, y: 792 - 8, width: 612 / 6 + 1, height: 8, color: c }));

  // Encabezado
  const logo = await pdf.embedPng(Buffer.from(LOGO_PNG_BASE64, 'base64'));
  page.drawImage(logo, { x: M, y: 792 - 40 - 52, width: 194, height: 52 });
  derecha('RECIBO DE PAGO', 612 - M, 792 - 58, 20, negrita);
  derecha(`N.º ${d.numero}`, 612 - M, 792 - 78, 13, negrita, magenta);
  derecha(`Fecha de emisión: ${fecha(d.fechaEmision)}`, 612 - M, 792 - 94, 9, normal, gris);

  texto(ASOCIACION.nombre, M, 792 - 118, 9.5, negrita);
  texto(`NIT ${ASOCIACION.nit}  ·  ${ASOCIACION.domicilio}`, M, 792 - 131, 8.5, normal, gris);
  texto(ASOCIACION.contacto, M, 792 - 143, 8.5, normal, gris);
  page.drawLine({ start: { x: M, y: 792 - 156 }, end: { x: M + W, y: 792 - 156 }, thickness: 1.2, color: navy });

  // Detalle
  let y = 792 - 188;
  const fila = (etiqueta: string, valor: string, negritaValor = false) => {
    texto(etiqueta, M, y, 9, normal, gris);
    const lineas = envolver(w(valor), negritaValor ? negrita : normal, 11, W - 150);
    lineas.forEach((l, i) => texto(l, M + 150, y - i * 14, 11, negritaValor ? negrita : normal));
    y -= Math.max(1, lineas.length) * 14 + 9;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: M + W, y: y + 6 }, thickness: 0.5, color: linea });
  };
  fila('Recibimos de', d.socio.nombre, true);
  fila('Carné de socio', d.socio.carnet);
  fila('Concepto', d.concepto);
  fila('Fecha del pago', fecha(d.fechaPago));
  if (d.referencia) fila('Referencia bancaria', d.referencia);
  if (d.observaciones && d.observaciones !== d.concepto) fila('Observaciones', d.observaciones);

  // Monto
  y -= 10;
  page.drawRectangle({ x: M, y: y - 62, width: W, height: 74, color: rgb(0.96, 0.96, 0.98), borderColor: linea, borderWidth: 1 });
  texto('MONTO RECIBIDO', M + 16, y - 8, 9, negrita, gris);
  texto(usd(d.monto), M + 16, y - 40, 28, negrita, navy);
  const letras = envolver(`Son: ${montoEnLetras(d.monto)}`, normal, 9.5, W / 2 - 10);
  letras.forEach((l, i) => texto(l.toUpperCase(), M + W / 2 + 10, y - 22 - i * 12, 9.5, normal, navy));
  y -= 90;

  // Saldo
  let saldoTxt = '';
  if (d.saldoDespues !== null) {
    if (d.saldoDespues > 0.004) saldoTxt = `Saldo pendiente después de este pago: ${usd(d.saldoDespues)}`;
    else if (d.saldoDespues < -0.004) saldoTxt = `Saldo a favor después de este pago: ${usd(-d.saldoDespues)}`;
    else saldoTxt = 'Cuenta al día: sin saldo pendiente después de este pago.';
  }
  if (saldoTxt) { texto(saldoTxt, M, y, 11, negrita, magenta); y -= 26; }

  // Firma y sello
  const firma = await activoPrivado('firma.png');
  const sello = await activoPrivado('sello.png');
  const baseFirma = Math.min(y - 40, 230);
  if (sello) {
    const img = await pdf.embedPng(sello);
    page.drawImage(img, { x: M + 250, y: baseFirma - 12, width: 150, height: 150 * (img.height / img.width) });
  }
  if (firma) {
    const img = await pdf.embedPng(firma);
    page.drawImage(img, { x: M + 10, y: baseFirma + 4, width: 130, height: 130 * (img.height / img.width) });
  }
  page.drawLine({ start: { x: M, y: baseFirma }, end: { x: M + 200, y: baseFirma }, thickness: 0.8, color: navy });
  texto(d.firmante.nombre, M, baseFirma - 14, 10, negrita);
  texto(d.firmante.cargo, M, baseFirma - 27, 9, normal, gris);

  // Pie
  page.drawLine({ start: { x: M, y: 62 }, end: { x: M + W, y: 62 }, thickness: 0.5, color: linea });
  texto('Comprobante de aportación emitido por ASAGUITUR. Puede verificar el estado de su cuenta en el portal del socio.', M, 48, 8, normal, gris);
  texto('Conserve este recibo junto con su boleta de pago del banco.', M, 37, 8, normal, gris);

  // Recibo anulado
  if (d.anulado) {
    page.drawText('ANULADO', { x: 110, y: 330, size: 110, font: negrita, color: rgb(0.71, 0.14, 0.09), opacity: 0.22, rotate: degrees(30) });
    page.drawRectangle({ x: M, y: 76, width: W, height: 40, color: rgb(0.99, 0.91, 0.9), borderColor: rgb(0.71, 0.14, 0.09), borderWidth: 1 });
    texto(`Recibo anulado el ${fecha(d.anulado.fecha)}.`, M + 10, 100, 9.5, negrita, rgb(0.71, 0.14, 0.09));
    envolver(`Motivo: ${d.anulado.motivo}`, normal, 9, W - 20).slice(0, 1).forEach((l) => texto(l, M + 10, 86, 9, normal, rgb(0.71, 0.14, 0.09)));
  }

  return pdf.save();
}
