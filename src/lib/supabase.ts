import { createClient } from '@supabase/supabase-js';
import { env, supabaseUrl } from './env';

const url = supabaseUrl();
const anon = env('PUBLIC_SUPABASE_ANON_KEY');
const service = env('SUPABASE_SERVICE_ROLE_KEY');

/** Lectura pública (respeta RLS). null si aún no hay variables → se usan datos de ejemplo. */
export const supabase = url && anon ? createClient(url, anon, { auth: { persistSession: false } }) : null;

/** Escritura desde el servidor (reseñas y clics). Nunca importar en código de cliente. */
export const supabaseAdmin = url && service ? createClient(url, service, { auth: { persistSession: false } }) : null;
