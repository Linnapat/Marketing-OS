// Server-only Supabase client using the SERVICE ROLE key. Never import this from
// a client component — the service role bypasses Row Level Security. Used by the
// seed route and any server-side write that must run with elevated rights.

import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isAdminConfigured = Boolean(url && service);

export function supabaseAdmin(): SupabaseClient | null {
  if (!isAdminConfigured) return null;
  return createClient(url!, service!, { auth: { persistSession: false } });
}
