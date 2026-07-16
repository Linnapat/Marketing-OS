// Server-side auth guard for API routes that trigger real outbound actions
// (posting to Meta, sending LINE/email). Mirrors the client-side AUTH_REQUIRED
// flag in lib/auth: enforcement is ON only when the app is configured to require
// auth AND Supabase is wired up. In demo mode (no auth / no database) these
// routes stay open so the app runs identically without a backend.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when API routes must verify the caller's session. */
export const API_AUTH_REQUIRED =
  process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true" && Boolean(url && anon);

export interface ApiUser {
  id: string;
  email: string | null;
}

type Guard = { user: ApiUser } | { error: NextResponse };

/** Verify the caller from the `Authorization: Bearer <supabase access token>`
 *  header. Returns the resolved user, or a ready-to-return 401 NextResponse.
 *  When auth is not enforced (demo mode) it resolves to an anonymous sentinel
 *  so callers can treat the result uniformly. */
export async function requireApiUser(req: NextRequest): Promise<Guard> {
  if (!API_AUTH_REQUIRED) return { user: { id: "demo", email: null } };

  const header = req.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return { error: NextResponse.json({ ok: false, error: "Unauthorized: missing bearer token" }, { status: 401 }) };
  }

  const client = createClient(url!, anon!, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    return { error: NextResponse.json({ ok: false, error: "Unauthorized: invalid session" }, { status: 401 }) };
  }
  return { user: { id: data.user.id, email: data.user.email ?? null } };
}

/** Narrowing helper: true when the guard produced an error response. */
export function isApiAuthError(g: Guard): g is { error: NextResponse } {
  return "error" in g;
}
