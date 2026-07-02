// Server-side auth guard for API routes.
// Verifies the Supabase access token sent by the client in the
// Authorization header. Blocks anonymous callers from burning the
// Anthropic API key or using the metadata fetchers.

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Returns the authenticated user, or null if the request is anonymous
 * or the token is invalid/expired.
 */
export async function getRequestUser(req) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return null;

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

/** 401 response helper */
export function unauthorized() {
  return new Response(JSON.stringify({ error: 'Sign in required' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
