import { supabase } from './supabase';
import { MOCK_GUIDES, MOCK_REVIEWS } from '../data/mock';
import type { Guide, Review } from './types';

export async function getGuides(): Promise<Guide[]> {
  if (!supabase) return MOCK_GUIDES;
  const { data, error } = await supabase.from('guides_with_stats').select('*').order('full_name');
  if (error) { console.error('getGuides:', error.message); return []; }
  return data as Guide[];
}

export async function getGuide(id: string): Promise<Guide | null> {
  if (!supabase) return MOCK_GUIDES.find((g) => g.id === id) ?? null;
  const { data } = await supabase.from('guides_with_stats').select('*').eq('id', id).maybeSingle();
  return (data as Guide) ?? null;
}

export async function getApprovedReviews(guideId: string): Promise<Review[]> {
  if (!supabase) return MOCK_REVIEWS.filter((r) => r.guide_id === guideId);
  const { data, error } = await supabase
    .from('reviews')
    .select('id, guide_id, author_name, rating, comment, created_at')
    .eq('guide_id', guideId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (error) { console.error('getApprovedReviews:', error.message); return []; }
  return data as Review[];
}
