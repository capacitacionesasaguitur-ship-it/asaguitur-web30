# Puesta en marcha · Fase 5 (cuotas, pagos manuales, recibos y mora)

## 1. Base de datos (Supabase → SQL Editor)
1. Si aún no lo hizo, ejecute en orden `schema.sql`, `fase2`, `fase3` y `fase4`.
2. Ejecute `supabase/fase5-cuotas-manuales.sql` **una sola vez**. Las cuotas comienzan en noviembre de 2026 (`cuotas_desde`); no se crea ninguna cuota anterior.
3. Reglas que se pueden cambiar sin tocar código (Table Editor → tabla `config`):
   - `cuota_mensual` (3.00) · `dia_vencimiento` (25) · `cuotas_desde` (2026-11-01)
   - `meses_mora_inactivar` (6): cuotas vencidas para pasar a inactivo por mora.
   - `meses_mora_reactivar` (2): se reactiva con este número de cuotas vencidas o menos.
   - `firmante_nombre` y `firmante_cargo`: quien firma los recibos.
4. Los socios nuevos entran como **pendientes** (no pagan ni se ven en el directorio). La Junta los activa con el interruptor de la pestaña Socios del panel; su primera cuota es la del mes de activación (o la del mes siguiente si los activan después del día 25).

## 2. Firma y sello (privados)
En Supabase → Storage → bucket **recibos-assets** suba los archivos `firma.png` y `sello.png` (están en la carpeta `subir-a-supabase-storage` que se entregó aparte). No los suba a GitHub.

## 3. Variables en Netlify
Agregue `PAGOS_INSTRUCCIONES` (datos del banco que verán los socios) y `CRON_SECRET` (una clave larga inventada). Elimine de Netlify cualquier variable de pagos en línea que haya quedado de una versión anterior.

## 4. Tareas diarias
Netlify detecta `netlify/functions/cron-diario.mjs` y lo ejecuta cada día a las 8:00 a. m. (hora de El Salvador): genera la cuota del mes (el día 1), inactiva por mora, reactiva y envía los avisos por correo (el día 20: "tu cuota vence el 25"; y los de cuotas vencidas), una vez al mes por socio.

## 5. Tesorero o asistente
Cree su usuario en Supabase → Authentication y ejecute:
```sql
insert into public.admins (user_id, note, rol)
select id, 'Tesorería', 'tesorero' from auth.users where email = 'correo@dominio.com';
```
El rol `tesorero` solo ve **Finanzas**. El rol `junta` ve todo el panel.

## 6. Prueba rápida
1. Entre a `/admin/finanzas`, registre un pago de $3.00 a un socio de prueba con su correo.
2. Verifique: recibo PDF con firma y sello, correo recibido, saldo actualizado en `/socio#pagos`.
3. Anule el pago y confirme que el recibo queda marcado ANULADO y el saldo se recalcula.
