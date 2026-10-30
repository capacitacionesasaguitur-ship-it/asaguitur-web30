// Invita por correo a los socios activos que tienen correo registrado y aún no tienen usuario en el portal.
//   Simulacro (no envía nada):  npm run invitar
//   Envío real:                 npm run invitar -- --enviar
import { createClient } from '@supabase/supabase-js';

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltan PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el archivo .env'); process.exit(1); }

const enviar = process.argv.includes('--enviar');
const sb = createClient(url, key, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { data: socios, error } = await sb.from('guides').select('id, full_name, email')
  .is('user_id', null).not('email', 'is', null).eq('active', true).order('full_name');
if (error) { console.error('Error leyendo socios:', error.message); process.exit(1); }

console.log(`${socios.length} socios por invitar${enviar ? '' : ' (SIMULACRO: no se envía nada; usa --enviar para enviar)'}\n`);
let ok = 0, fallos = 0;
for (const s of socios) {
  if (!enviar) { console.log(`  - ${s.full_name} <${s.email}>`); continue; }
  const { error: e } = await sb.auth.admin.inviteUserByEmail(s.email);
  if (e) { fallos++; console.log(`  ✗ ${s.full_name} <${s.email}>: ${e.message}`); }
  else { ok++; console.log(`  ✓ ${s.full_name} <${s.email}>`); }
  await sleep(1500);   // evita topar con el límite de correos por minuto
}
if (enviar) console.log(`\nListo: ${ok} invitaciones enviadas, ${fallos} con error.`);
