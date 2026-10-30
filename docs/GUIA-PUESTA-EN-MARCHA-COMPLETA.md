# Guía completa de puesta en marcha · www.asaguitur.org

Proyecto nuevo, desde cero. Siga los pasos en este orden. Tiempo estimado: 2 a 3 horas, sin contar la propagación del DNS.

## 1. Supabase (base de datos y usuarios)
1. Cree un proyecto nuevo (región cercana, por ejemplo East US). Guarde la contraseña de la base de datos.
2. En **Project Settings → API** copie: `Project URL`, `anon public key` y `service_role key` (esta última es secreta).
3. En **SQL Editor**, pegue y ejecute **uno por uno, en este orden y una sola vez cada uno**:
   `schema.sql` → `fase2-carnet.sql` → `fase3-extranet.sql` → `fase4-admin.sql` → `fase5-cuotas-manuales.sql`.
   Cada uno debe terminar con "Success". Si alguno da error, no siga: copie el mensaje y revíselo antes de continuar.
4. Reglas de cuotas (opcional): **Table Editor → config**. Ya vienen cuota $3.00, vencimiento día 25 y primera cuota en noviembre de 2026.

## 2. Supabase: correos de acceso (obligatorio)
Sin este paso las invitaciones y la recuperación de clave no funcionan.

**a) Remitente propio (SMTP con Resend).** El correo que trae Supabase por defecto solo envía unos pocos mensajes por hora.
**Authentication → Emails → SMTP Settings → Enable custom SMTP**:
- Host `smtp.resend.com` · Puerto `465` · Usuario `resend` · Contraseña: su API Key de Resend
- Remitente: `comunicaciones@asaguitur.org` (el dominio debe estar verificado en Resend)

**b) URL del sitio.** **Authentication → URL Configuration**:
- Site URL: `https://www.asaguitur.org`
- Redirect URLs: `https://www.asaguitur.org/**`

**c) Plantillas de correo.** **Authentication → Emails → Templates**. En cada una, cambie el enlace del botón por el indicado:

| Plantilla | Enlace |
|---|---|
| Invite user | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` |
| Magic link (si la usa) | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink` |

Ejemplo de la plantilla "Invite user":
```html
<h2>Bienvenido(a) a ASAGUITUR</h2>
<p>Ya tiene acceso al portal de socios. Haga clic para crear su contraseña:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Crear mi contraseña</a></p>
```

**d) Registro cerrado.** **Authentication → Sign In / Providers**: desactive "Allow new users to sign up". Solo entran quienes la Junta invite.

## 3. Firma y sello de los recibos
**Storage → bucket `recibos-assets`** (ya se creó con el SQL): suba `firma.png` y `sello.png`. No los suba a GitHub.

## 4. GitHub
Cree un repositorio **privado** y suba el contenido de la carpeta del proyecto (no el .zip). El archivo `.env` nunca se sube (ya está en `.gitignore`).

## 5. Netlify
1. **Add new site → Import from Git** y elija el repositorio. La configuración de compilación ya está en `netlify.toml`.
2. En **Site configuration → Environment variables** agregue:

| Variable | Valor |
|---|---|
| `PUBLIC_SUPABASE_URL` | Project URL de Supabase |
| `PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (secreta) |
| `PUBLIC_SITE_URL` | `https://www.asaguitur.org` (sin barra final) |
| `PAGOS_INSTRUCCIONES` | Datos del banco para los socios (una línea; use `\n` para separar renglones) |
| `CRON_SECRET` | Una clave larga inventada (mínimo 16 caracteres) |
| `RESEND_API_KEY` | API Key de Resend |
| `RESEND_FROM` | `ASAGUITUR <comunicaciones@asaguitur.org>` |
| `RESEND_REPLY_TO` | Correo donde recibirán respuestas (opcional) |

3. Haga **Deploy**. Si cambia variables después, vuelva a desplegar (Deploys → Trigger deploy).

## 6. Dominio www.asaguitur.org (Squarespace → Netlify)
1. En Netlify: **Domain management → Add a domain** → `asaguitur.org`, y deje `www.asaguitur.org` como dominio principal.
2. En Squarespace (**Domains → DNS Settings**) cree los registros que Netlify le indique en esa pantalla. Normalmente: `CNAME` de `www` hacia `su-sitio.netlify.app` y un registro `A` para el dominio sin `www`. Use los valores que muestre Netlify, no los de memoria.
3. Espere la propagación (minutos a horas) y active **HTTPS** en Netlify (Domain management → HTTPS → Verify DNS / Provision certificate).

## 7. Cuentas de la Junta y Tesorería
1. **Authentication → Users → Add user → Create new user**: correo y clave, marcando "Auto Confirm User".
2. En **SQL Editor** (cambie el correo):
```sql
insert into public.admins (user_id, note, rol)
select id, 'Junta', 'junta' from auth.users where email = 'correo@dominio.com';
```
Para el tesorero o asistente (solo ve Finanzas) use `'Tesorería', 'tesorero'`.

## 8. Cargar a los socios
1. **Table Editor → guides → Insert → Import data from CSV**, con `docs/plantilla-socios.csv` (borre antes las dos filas de ejemplo).
   - `estado = activo`: el socio sale en el directorio y comienza a pagar en noviembre de 2026.
   - `estado = pendiente`: la ficha queda oculta y sin cuotas hasta que la Junta la active desde el panel.
2. Invitar a los socios por correo, desde su computadora (necesita Node 20):
```bash
npm install
cp .env.example .env      # complete las claves reales
npm run invitar           # simulacro: solo muestra a quién invitaría
npm run invitar -- --enviar
```
El script invita solo a socios **activos** con correo que aún no tienen usuario.

## 9. Pruebas antes de anunciar el sitio
1. Entre a `/login` con la cuenta de la Junta y abra `/admin`.
2. Abra `/directorio` y `/carnet/<id>` de un socio activo y escanee el QR.
3. Invite primero a 1 o 2 socios de prueba: deben recibir el correo, crear su clave y entrar a `/socio`.
4. En `/admin/finanzas` registre un pago de $3.00 a un socio de prueba. Verifique el recibo PDF (con firma y sello), el correo y el saldo en `/socio`. Luego anule el pago.
5. Envíe un boletín de prueba a su propio correo desde `/admin/boletin`.
6. Recién entonces invite a todos los socios.

## Tarea diaria
Netlify ejecuta `netlify/functions/cron-diario.mjs` cada día a las 8:00 a. m. (hora de El Salvador). Genera la cuota del mes el día 1, aplica la mora y envía los avisos. Solo corre en el sitio publicado.
