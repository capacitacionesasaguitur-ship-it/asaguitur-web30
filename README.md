# ASAGUITUR · Plataforma web oficial

Astro 5 (SSR) + Tailwind CSS 4 + Supabase (base de datos, Auth, Storage) + Resend + pdf-lib. Despliegue en Netlify.
Los pagos son manuales: la Tesorería registra el pago con su comprobante y el sistema genera el recibo, actualiza el saldo y controla la mora.

## Módulos
| Fase | Qué hace | Rutas principales |
|---|---|---|
| 1 | Directorio público, tarjeta con WhatsApp rastreable, reseñas | `/directorio`, `/guias/[id]` |
| 2 | Carné digital con QR y verificación en vivo | `/carnet/[id]`, `/api/verify/[id]` |
| 3 | Portal del socio: perfil, estado de cuenta, recibos, biblioteca, eventos | `/login`, `/socio` |
| 4 | Panel de la Junta y boletines (Resend) | `/admin`, `/admin/boletin` |
| 5 | Cuotas mensuales, pagos manuales, recibos PDF, mora automática, rol de tesorero | `/admin/finanzas`, `/api/cron/diario` |

## Estructura
```
supabase/   schema.sql → fase2-carnet.sql → fase3-extranet.sql → fase4-admin.sql → fase5-cuotas-manuales.sql  (en ese orden, una sola vez)
netlify/    functions/cron-diario.mjs  (tarea diaria: cuotas, mora y avisos)
docs/       PUESTA-EN-MARCHA-FASE5.md
docs/       plantilla-socios.csv
scripts/    invitar-socios.mjs  (npm run invitar: invita por correo a los socios al portal)
src/
  components/  GuideCard, GuideReviews, QRCodeGenerator, MemberDashboard (+ Profile/Payments panels),
               DocumentLibrary, EventsManager, AdminMembers/Reviews/Content/Metrics/Finanzas, AdminNav
  layouts/     BaseLayout
  lib/         supabase*, finanzas, recibo, resend, mail, carnet, member, admin*, recipients, qr, env, http
  pages/       index, directorio, guias, carnet, login, reset-password, socio, admin (+finanzas), auth, api/*
  middleware.ts   protege /socio, /admin y /api/member|admin (sesión + rol de administrador)
```

## Puesta en marcha
Guía paso a paso desde cero: `docs/GUIA-PUESTA-EN-MARCHA-COMPLETA.md`.

## Desarrollo local
```bash
npm install
cp .env.example .env     # sin Supabase configurado se ven datos de ejemplo en el directorio y el carné
npm run dev              # http://localhost:4321
```
El portal, el panel, los pagos y los correos requieren las variables reales (ver `.env.example`).

## Dominio
Sitio: **www.asaguitur.org** (dominio registrado en Squarespace; el DNS se administra allí y apunta a Netlify).
El dominio no está escrito en el código: se toma de `PUBLIC_SITE_URL`. Si algún día cambia, se actualiza esa variable, el remitente `RESEND_FROM`, la Site URL de Supabase y el DNS.

## Identidad visual
El logo y los colores son los oficiales de ASAGUITUR (versión a colores). Todo el diseño toma los colores de un solo lugar: `src/styles/global.css`.

| Color | Código | Dónde se usa |
|---|---|---|
| Azul marino | `#191838` | Textos, botones, encabezados, código QR |
| Magenta | `#ca176b` | Acentos, barras de métricas, botón de pago en correos |
| Amarillo | `#ffe529` | Franja de colores, etiqueta "Pendiente" |
| Azul | `#268dc7` | Anillo de foco del teclado |
| Verde lima | `#c8cf67` | Franja de colores |
| Ciruela | `#7b2a65` | Franja de colores |

Los colores de significado (verde de socio vigente, rojo de no vigente, verde de WhatsApp) se mantienen aparte a propósito.
Archivos del logo en `public/`: `logo.png` (original), `logo-header.png` (cabecera y carné), `logo-email.png` (correos), `favicon-32.png`, `icon-192.png`, `apple-touch-icon.png` y `og-image.png` (vista previa al compartir el enlace).

## Seguridad en pocas líneas
- Las claves secretas (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET`) solo viven en el servidor.
- La firma y el sello de los recibos NO están en el repositorio: viven en el bucket privado `recibos-assets` de Supabase.
- Los socios y el público leen con RLS; todo lo que escribe o administra pasa por rutas `/api` que validan sesión y rol.
- El panel registra cada acción en `admin_audit_log`.
