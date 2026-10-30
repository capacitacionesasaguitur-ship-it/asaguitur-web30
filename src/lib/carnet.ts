import { supabase } from './supabase';
import { MOCK_GUIDES } from '../data/mock';

export interface Carnet {
  id: string;
  full_name: string | null;   // null si el socio está inactivo (lo oculta la función SQL)
  carnet: string;
  rnt: string | null;
  photo_url: string | null;
  department: string | null;
  active: boolean;
  member_since: string | null; // 'YYYY-MM-DD'
  valid_until: string | null;  // ya no se usa: el estado depende de la cuenta al día (ver fase5)
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TZ = 'America/El_Salvador';

const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
export const isExpired = (c: Carnet) => !!c.valid_until && c.valid_until < todayISO();
export const isVigente = (c: Carnet) => c.active && !isExpired(c);

export const svDate = (iso: string) =>
  new Intl.DateTimeFormat('es-SV', { dateStyle: 'long' }).format(new Date(`${iso}T12:00:00`));
export const svDateTime = (d: Date) =>
  new Intl.DateTimeFormat('es-SV', { dateStyle: 'long', timeStyle: 'short', timeZone: TZ }).format(d);

// Datos de ejemplo (sin Supabase): 6 vigentes + 1 inactivo + 1 vencido
const MOCK_CARNETS: Carnet[] = [
  ...MOCK_GUIDES.map((g) => ({
    id: g.id, full_name: g.full_name, carnet: g.carnet, rnt: g.rnt, photo_url: g.photo_url,
    department: g.department, active: true, member_since: '2019-03-01', valid_until: '2027-12-31',
  })),
  { id: '00000000-0000-4000-8000-000000000007', full_name: null, carnet: 'ASG-007', rnt: null, photo_url: null,
    department: null, active: false, member_since: '2018-01-15', valid_until: '2025-12-31' },
  { id: '00000000-0000-4000-8000-000000000008', full_name: 'Socio con carné vencido', carnet: 'ASG-008', rnt: 'RNT-GT-1999',
    photo_url: null, department: 'San Miguel', active: true, member_since: '2020-02-01', valid_until: '2025-06-30' },
];

/**
 * Lee el estado SIEMPRE en vivo desde public.guides (vía la función verify_carnet).
 * Devuelve null si el carné no existe; LANZA error si la base no responde, para no
 * declarar "no vigente" a un socio por una falla técnica.
 */
export async function getCarnet(id: string): Promise<Carnet | null> {
  if (!UUID_RE.test(id)) return null;
  if (!supabase) return MOCK_CARNETS.find((c) => c.id === id) ?? null;

  const { data, error } = await supabase.rpc('verify_carnet', { p_id: id });
  if (error) throw new Error(`verify_carnet: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Carnet) ?? null;
}
