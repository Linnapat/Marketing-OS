// Reads the "Ad_Actuals" tab of a shared Google Sheet and returns parsed
// CampaignResultRow[] for the client to upsert into Supabase (campaign_results).
// Read-only and server-side (avoids CORS); the sheet must be shared
// "Anyone with the link — Viewer". Writing stays client-side under the user's
// RLS session via saveResults().

import { NextRequest, NextResponse } from "next/server";
import { spreadsheetId, fetchSheetTab } from "@/lib/googleSheet";
import { requireApiUser, isApiAuthError } from "@/lib/apiAuth";
import { parseAdActuals } from "@/lib/data/adActualsSheet";

export const dynamic = "force-dynamic";

const TAB = "Ad_Activities";
const SHARE_HINT = 'ตรวจว่าแชร์ sheet เป็น "Anyone with the link · Viewer" และมีแท็บชื่อ Ad_Activities';

export async function GET(req: NextRequest) {
  const guard = await requireApiUser(req);
  if (isApiAuthError(guard)) return guard.error;

  const url = req.nextUrl.searchParams.get("url") ?? "";
  const id = spreadsheetId(url);
  if (!id) return NextResponse.json({ error: "ลิงก์ Google Sheets ไม่ถูกต้อง" }, { status: 400 });

  try {
    const grid = await fetchSheetTab(id, TAB);
    const rows = parseAdActuals(grid);
    return NextResponse.json({ rows, count: rows.length, generatedAt: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = message === "SHEET_NOT_SHARED" ? SHARE_HINT : message;
    return NextResponse.json({ error: hint }, { status: 502 });
  }
}
