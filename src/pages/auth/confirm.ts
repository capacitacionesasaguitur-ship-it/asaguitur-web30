import type { APIRoute } from 'astro';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createServerSupabase } from '../../lib/supabase-server';

export const prerender = false;
const TIPOS = ['recovery', 'invite', 'email', 'magiclink'];

export const GET: APIRoute = async ({ url, request, cookies, redirect }) => {
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const supabase = createServerSupabase(request, cookies);
  if (!supabase || !token_hash || !type || !TIPOS.includes(type)) return redirect('/login?error=enlace');

  const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash });
  if (error) return redirect('/login?error=enlace');
  return redirect(type === 'recovery' || type === 'invite' ? '/reset-password' : '/socio');
};
