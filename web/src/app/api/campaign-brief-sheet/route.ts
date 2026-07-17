// Reads a campaign brief from a Google Sheet built on the Marketing OS template
// (tabs: Overview, Content, KOL, Budget — Overview required, the rest optional).
// The sheet must be shared "Anyone with the link — Viewer"; we fetch each tab's
// CSV export server-side, by tab NAME so a copied template keeps working.
//
// This route only READS and maps. It returns a patch for the Create Campaign
// form to prefill — nothing is written to the database here, so the planner
// still reviews the brief and the app's own validation and over-PL-budget guard
// decide what may be submitted.

import { NextRequest, NextResponse } from "next/server";
import { spreadsheetId, fetchSheetTab } from "@/lib/googleSheet";
import { requireApiUser, isApiAuthError } from "@/lib/apiAuth";
import { loadBrandConfig, makeBrandResolver } from "@/lib/serverBrands";
import { briefFromSheet, looksLikeTab, BRIEF_SHEET_TABS } from "@/lib/data/briefSheet";

export const dynamic = "force-dynamic";

const SHARE_HINT = 'ตรวจว่าแชร์ sheet แบบ "Anyone with the link · Viewer" แล้ว';

export async function GET(req: NextRequest) {
  const guard = await requireApiUser(req);
  if (isApiAuthError(guard)) return guard.error;

  const url = req.nextUrl.searchParams.get("url") ?? "";
  const id = spreadsheetId(url);
  if (!id) return NextResponse.json({ error: "ลิงก์ไม่ใช่ Google Sheets — วางลิงก์จากปุ่ม Share ของ sheet" }, { status: 400 });

  let grids: string[][][];
  try {
    grids = await Promise.all([
      fetchSheetTab(id, BRIEF_SHEET_TABS.overview),
      fetchSheetTab(id, BRIEF_SHEET_TABS.content),
      fetchSheetTab(id, BRIEF_SHEET_TABS.kol),
      fetchSheetTab(id, BRIEF_SHEET_TABS.budget),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === "SHEET_NOT_SHARED") {
      return NextResponse.json({ error: `sheet ยังไม่เปิดแชร์ — ${SHARE_HINT}` }, { status: 403 });
    }
    return NextResponse.json({ error: `อ่าน sheet ไม่ได้ — ${SHARE_HINT}` }, { status: 502 });
  }

  // A request for a tab that doesn't exist comes back as the sheet's FIRST tab,
  // not as an error — so each grid is only accepted once it looks like the tab
  // it was asked for. Otherwise a one-tab sheet would import its Overview rows
  // again as content/KOL/budget.
  const [overview, content, kol, budget] = grids;
  if (!looksLikeTab("overview", overview)) {
    return NextResponse.json(
      { error: `ไม่พบแท็บ “${BRIEF_SHEET_TABS.overview}” (หรือไม่มีคอลัมน์ Field / Value ตาม template) — ใช้ template ของ Marketing OS: แท็บ Overview / Content / KOL / Budget` },
      { status: 400 },
    );
  }
  const contentGrid = looksLikeTab("content", content) ? content : null;
  const kolGrid = looksLikeTab("kol", kol) ? kol : null;
  const budgetGrid = looksLikeTab("budget", budget) ? budget : null;

  // Resolve the sheet's brand label against the brands configured in Settings,
  // the same way the budget importer does.
  const resolveBrand = makeBrandResolver(await loadBrandConfig(req.headers.get("authorization")));
  const result = briefFromSheet({ overview, content: contentGrid, kol: kolGrid, budget: budgetGrid }, resolveBrand);

  const missing = [
    !contentGrid && BRIEF_SHEET_TABS.content,
    !kolGrid && BRIEF_SHEET_TABS.kol,
    !budgetGrid && BRIEF_SHEET_TABS.budget,
  ].filter(Boolean) as string[];
  if (missing.length) result.warnings.push(`ไม่พบแท็บ ${missing.join(" / ")} — ข้ามส่วนนั้นไป กรอกในฟอร์มได้`);

  return NextResponse.json(result);
}
