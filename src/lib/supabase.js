import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error('Missing Supabase env vars. Copy .env.local.example → .env.local and fill in your keys.');
}

export const supabase = createClient(url, key);

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ─── Entries CRUD ─────────────────────────────────────────────────────────────

export async function fetchEntries() {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function insertEntry(entry) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('entries')
    .insert({ ...entry, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function incrementOpens(id) {
  // Use rpc for atomic increment
  const { error } = await supabase.rpc('increment_opens', { entry_id: id });
  if (error) {
    // Fallback: read + write (non-atomic but fine for personal tool)
    const { data } = await supabase.from('entries').select('opens').eq('id', id).single();
    await supabase.from('entries').update({ opens: (data?.opens || 0) + 1 }).eq('id', id);
  }
}

export async function updateEntry(id, updates) {
  const { data, error } = await supabase
    .from('entries')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEntry(id) {
  const { error } = await supabase.from('entries').delete().eq('id', id);
  if (error) throw error;
}
