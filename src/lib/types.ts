export interface Guide {
  id: string;
  full_name: string;
  carnet: string;          // Número de carné de socio
  rnt: string;             // Registro Nacional de Turismo
  photo_url: string | null;
  languages: string[];
  specialties: string[];
  department: string;
  whatsapp: string;        // con código de país, ej. 50370001234
  bio: string | null;
  avg_rating: number | null;
  reviews_count: number;
}

export interface Review {
  id: string;
  guide_id: string;
  author_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export const DEPARTAMENTOS = [
  'Ahuachapán', 'Cabañas', 'Chalatenango', 'Cuscatlán', 'La Libertad', 'La Paz', 'La Unión',
  'Morazán', 'San Miguel', 'San Salvador', 'San Vicente', 'Santa Ana', 'Sonsonate', 'Usulután',
] as const;
