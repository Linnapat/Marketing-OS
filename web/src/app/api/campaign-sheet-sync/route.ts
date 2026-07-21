// Mirrors app-created rows (campaigns, KOL assignments) into a Google Sheet via
// an Apps Script Web App. The webhook URL is a server-only secret; the client
// posts { tab, headers, row, brand } here and this route forwards it to the
// right sheet. Supabase stays the source of truth — the mirror is best-effort
// so a failure here never blocks the save that triggered it.
//
// Per-brand routing: different brands can mirror into different physical
// spreadsheets (e.g. different teams own different brands) via
// CAMPAIGN_SHEET_WEBHOOKS, a JSON map of brand id -> webhook URL. A brand not
// in the map falls back to CAMPAIGN_SHEET_WEBHOOK_URL (the single-sheet setup).

import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, isApiAuthError } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

function resolveWebhook(brand: unknown): string | undefined {
  const raw = process.env.CAMPAIGN_SHEET_WEBHOOKS;
  if (raw && typeof brand === "string") {
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      if (map[brand]) return map[brand];
    } catch {
      // Malformed env value — ignore and fall through to the default webhook.
    }
  }
  return process.env.CAMPAIGN_SHEET_WEBHOOK_URL;
}

export async function POST(req: NextRequest) {
  const guard = await requireApiUser(req);
  if (isApiAuthError(guard)) return guard.error;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json body" }, { status: 400 });
  }

  const brand = payload && typeof payload === "object" ? (payload as Record<string, unknown>).brand : undefined;
  const webhook = resolveWebhook(brand);
  if (!webhook) {
    // Not configured yet — succeed quietly so the mirror is a no-op until an
    // Apps Script URL is set in the environment (default or per-brand).
    return NextResponse.json({ ok: true, skipped: "no webhook configured" });
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
