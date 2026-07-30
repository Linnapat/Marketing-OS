// Server-side auth guard for API routes that trigger real outbound actions
// (posting to Meta, sending LINE/email). Mirrors the client-side AUTH_REQUIRED
// flag in lib/auth: enforcement is ON only when the app is configured to require
// auth AND Supabase is wired up. In demo mode (no auth / no database) these
// routes stay open so the app runs identically without a backend.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

const LEVEL_RANK: Record<string, number> = { "—": 0, View: 1, Edit: 2, Approve: 3, Admin: 4 };

/** Server-side module-permission check, resolved against the database the same
 *  way Postgres' has_module() does — never from anything the client sent.
 *
 *  requireApiUser() only proves *who* is calling. Routes that fire an
 *  irreversible outward action (publishing to Meta) also need to know *what
 *  they may do*, and until now they didn't ask: any signed-in account could
 *  post to the brand's Facebook/Instagram. Mirrors the pattern
 *  /api/members/invite already uses for its Admin check.
 *
 *  Returns null when allowed, or a ready-to-return error response. */
export async function requireModuleLevel(
  email: string | null,
  module: string,
  min: "View" | "Edit" | "Approve" | "Admin",
): Promise<NextResponse | null> {
  if (!API_AUTH_REQUIRED) return null; // demo mode — no identities to check

  const admin = supabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "ตรวจสิทธิ์ไม่ได้: ยังไม่ได้ตั้ง SUPABASE_SERVICE_ROLE_KEY" },
      { status: 501 },
    );
  }
  const who = (email ?? "").toLowerCase();
  if (!who) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data: member } = await admin
    .from("members").select("role, access").ilike("email", who).maybeSingle();
  // No members row = no access at all, matching the auth hook's fail-closed default.
  if (!member) return NextResponse.json({ ok: false, error: "ไม่มีสิทธิ์ใช้งาน" }, { status: 403 });
  if (member.access === "Admin") return null; // CMO is never gated by the matrix

  const { data: perm } = await admin
    .from("permissions").select("perms").eq("role", member.role).maybeSingle();
  const entry = (perm?.perms as { module: string; level: string }[] | undefined)
    ?.find((p) => p.module === module);
  const rank = LEVEL_RANK[entry?.level ?? "—"] ?? 0;
  if (rank < LEVEL_RANK[min]) {
    return NextResponse.json(
      { ok: false, error: `ต้องมีสิทธิ์ ${module} ระดับ ${min} ขึ้นไป` },
      { status: 403 },
    );
  }
  return null;
}
