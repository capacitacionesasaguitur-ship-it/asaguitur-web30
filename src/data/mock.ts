import type { Guide, Review } from '../lib/types';

// Datos de ejemplo para desarrollo sin Supabase. Se descartan al configurar el .env.
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

export const MOCK_GUIDES: Guide[] = [
  { id: id(1), full_name: 'María Fernanda Alvarado', carnet: 'ASG-001', rnt: 'RNT-GT-1042', photo_url: null,
    languages: ['Español', 'Inglés'], specialties: ['Arqueología', 'Historia'], department: 'La Libertad',
    whatsapp: '50370000001', bio: 'Guía en Tazumal y San Andrés con más de 10 años de experiencia.', avg_rating: 4.9, reviews_count: 32 },
  { id: id(2), full_name: 'José Roberto Menjívar', carnet: 'ASG-002', rnt: 'RNT-GT-1077', photo_url: null,
    languages: ['Español', 'Inglés', 'Francés'], specialties: ['Senderismo', 'Aventura'], department: 'Santa Ana',
    whatsapp: '50370000002', bio: 'Rutas al volcán de Santa Ana y el Lago de Coatepeque.', avg_rating: 4.7, reviews_count: 18 },
  { id: id(3), full_name: 'Karla Beatriz Rivas', carnet: 'ASG-003', rnt: 'RNT-GT-1103', photo_url: null,
    languages: ['Español', 'Inglés', 'Alemán'], specialties: ['Historia', 'Gastronomía'], department: 'San Salvador',
    whatsapp: '50370000003', bio: 'Centro Histórico y mercados de San Salvador.', avg_rating: 4.8, reviews_count: 41 },
  { id: id(4), full_name: 'Carlos Eduardo Portillo', carnet: 'ASG-004', rnt: 'RNT-GT-1121', photo_url: null,
    languages: ['Español'], specialties: ['Senderismo', 'Aves y naturaleza'], department: 'Chalatenango',
    whatsapp: '50370000004', bio: null, avg_rating: 4.5, reviews_count: 9 },
  { id: id(5), full_name: 'Ana Lucía Hernández', carnet: 'ASG-005', rnt: 'RNT-GT-1150', photo_url: null,
    languages: ['Español', 'Inglés'], specialties: ['Surf', 'Aventura'], department: 'La Libertad',
    whatsapp: '50370000005', bio: 'Ruta de las playas del Surf City.', avg_rating: null, reviews_count: 0 },
  { id: id(6), full_name: 'Rafael Antonio Cruz', carnet: 'ASG-006', rnt: 'RNT-GT-1188', photo_url: null,
    languages: ['Español', 'Inglés'], specialties: ['Arqueología', 'Cultura'], department: 'Morazán',
    whatsapp: '50370000006', bio: 'Ruta de Paz y memoria histórica en Morazán.', avg_rating: 4.9, reviews_count: 14 },
];

export const MOCK_REVIEWS: Review[] = [
  { id: 'r1', guide_id: id(1), author_name: 'Daniel (EE. UU.)', rating: 5,
    comment: 'Explicó Tazumal con mucho detalle y paciencia. Muy recomendada.', created_at: '2026-09-14T10:00:00Z' },
  { id: 'r2', guide_id: id(1), author_name: 'Lucía M.', rating: 5,
    comment: 'Puntual, amable y con muchísimo conocimiento histórico.', created_at: '2026-08-02T10:00:00Z' },
];
