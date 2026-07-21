// Mirrors a newly created campaign into a Google Sheet via an Apps Script Web
// App. The webhook URL is a server-only secret (CAMPAIGN_SHEET_WEBHOOK_URL);
// the client posts the campaign here and this route forwards it. Supabase stays
// the source of truth — the Sheet is a mirror, so a failure here never blocks a
// campaign save (the caller fires this best-effort and ignores the result).

import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, isApiAuthError } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireApiUser(req);
  if (isApiAuthError(guard)) return guard.error;

  const webhook = process.env.CAMPAIGN_SHEET_WEBHOOK_URL;
  if (!webhook) {
    // Not configured yet — succeed quietly so the mirror is a no-op until the
    // Apps Script URL is set in the environment.
    return NextResponse.json({ ok: true, skipped: "no webhook configured" });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json body" }, { status: 400 });
  }

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.text()).slice(0, 500);
    return NextResponse.json({ ok: res.ok, status: res.status, body });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 });
  }
}
