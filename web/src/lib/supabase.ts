// Supabase browser client (anon key). Optional: when the env vars are absent
// the whole app transparently falls back to the bundled mock data, so the
// project builds and runs identically with or without a database configured.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when a Supabase project is wired up via env vars. */
export const isSupabaseConfigured = Boolean(url && anon);

let _client: SupabaseClient | null = null;

/** The shared anon client, or null when Supabase is not configured. */
export function supabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!_client) _client = createClient(url!, anon!, { auth: { persistSession: true } });
  return _client;
}
