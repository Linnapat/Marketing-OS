/* Platform Performance → Google Sheet mirror: the row shape, and which brands
 * are allowed to leave the system.
 * Run: node --import tsx scripts/test-perf-mirror.ts */

import {
  PERF_MIRROR_HEADERS, perfMirrorRow, parseMirrorBrands, shouldMirrorBrand, mirrorableRows,
} from "../src/lib/data/perfMirror";
import type { CampaignResultRow } from "../src/lib/data/campaignResult";
import type { BrandId } from "../src/lib/brands";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) console.error(`    expected ${e}\n         got ${a}`);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

const row = (over: Partial<CampaignResultRow> = {}): CampaignResultRow => ({
  id: "res-CAM-2026-0001-01", campaignId: "CAM-2026-0001",
  ad: "Wagyu carousel", audience: "Foodies 25-40", role: "Awareness",
  platform: "FB/IG", type: "Album", kpi: "reach",
  target: 100000, budget: 30000, days: 14, cvTargetPct: 0.3,
  reachActual: 87000, budgetActual: 28500, conversions: 210, marketingVisits: 45,
  ...over,
} as CampaignResultRow);

console.log("\n— แถวที่ส่งเข้าชีต —");
{
  const cells = perfMirrorRow(row(), { campaignName: "Wagyu Festival", brand: "teppen" as BrandId, syncedAt: "2026-07-28T03:00:00Z" });
  is("จำนวนคอลัมน์ตรงกับ header", cells.length, PERF_MIRROR_HEADERS.length);
  // ทั้ง id และชื่อต้องอยู่ครบ — id ไว้ให้สูตร match (rename แล้วไม่หลุด),
  // ชื่อไว้ให้คนอ่านออก
  is("คอลัมน์แรกคือ campaign_id", cells[0], "CAM-2026-0001");
  is("คอลัมน์สองคือชื่อแคมเปญ", cells[1], "Wagyu Festival");
  is("มีแบรนด์", cells[2], "teppen");
  is("มี row_id ไว้ upsert ทับได้", cells[3], "res-CAM-2026-0001-01");
  is("ตัวเลข actual ครบ", [cells[14], cells[15], cells[16], cells[17]], [87000, 28500, 210, 45]);
  is("มีเวลาที่ sync", cells[cells.length - 1], "2026-07-28T03:00:00Z");
}
{
  // ค่าที่หายไปต้องกลายเป็น 0 / "" ไม่ใช่ undefined ที่ทำให้คอลัมน์เลื่อน
  const sparse = perfMirrorRow(
    { id: "r1", campaignId: "C1" } as CampaignResultRow,
    { campaignName: "N", syncedAt: "t" },
  );
  is("แถวที่ข้อมูลไม่ครบ ยังได้จำนวนคอลัมน์เท่าเดิม", sparse.length, PERF_MIRROR_HEADERS.length);
  is("ไม่มี undefined หลุดไปในชีต", sparse.some((c) => c === undefined || c === null), false);
  is("ไม่มีแบรนด์ = ช่องว่าง", sparse[2], "");
}

console.log("\n— อ่านค่าตั้งว่าจะ sync แบรนด์ไหน —");
{
  is("ยังไม่เคยตั้ง (null) = ยังไม่กำหนด", parseMirrorBrands(null), null);
  is("ค่าว่าง = ยังไม่กำหนด", parseMirrorBrands(""), null);
  is("JSON พัง = ยังไม่กำหนด ไม่ใช่พังทั้งระบบ", parseMirrorBrands("{oops"), null);
  is("ไม่ใช่ array = ยังไม่กำหนด", parseMirrorBrands('"teppen"'), null);
  is("อ่านรายชื่อแบรนด์ได้", parseMirrorBrands('["teppen","touka"]'), ["teppen", "touka"]);
  is("คัดค่าที่ไม่ใช่ string ทิ้ง", parseMirrorBrands('["teppen",1,null,""]'), ["teppen"]);
  // ลิสต์ว่างคือ "เลือกแล้วว่าไม่ sync อะไรเลย" ต่างจากยังไม่เคยตั้ง
  is("ลิสต์ว่าง = ตั้งใจไม่ sync", parseMirrorBrands("[]"), []);
}

console.log("\n— แบรนด์ไหนได้ออกจากระบบ —");
{
  is("ยังไม่กำหนด = ส่งทุกแบรนด์", shouldMirrorBrand("teppen" as BrandId, null), true);
  is("อยู่ในลิสต์ = ส่ง", shouldMirrorBrand("teppen" as BrandId, ["teppen"] as BrandId[]), true);
  is("ไม่อยู่ในลิสต์ = ไม่ส่ง", shouldMirrorBrand("touka" as BrandId, ["teppen"] as BrandId[]), false);
  is("ลิสต์ว่าง = ไม่ส่งอะไรเลย", shouldMirrorBrand("teppen" as BrandId, [] as BrandId[]), false);
  // แถวที่ระบุแบรนด์ไม่ได้ ต้องไม่หลุดออกไปเพราะ "ยังไม่กำหนด"
  is("ไม่รู้แบรนด์ + มีลิสต์ = ไม่ส่ง", shouldMirrorBrand(undefined, ["teppen"] as BrandId[]), false);
}

console.log("\n— คัดแถวก่อนส่ง —");
{
  const campaigns: Record<string, { name: string; brand?: BrandId }> = {
    "CAM-1": { name: "Wagyu Festival", brand: "teppen" as BrandId },
    "CAM-2": { name: "Cocktail Hour", brand: "touka" as BrandId },
    "CAM-3": { name: "ไม่มีแบรนด์" },
  };
  const lookup = (id: string) => campaigns[id];
  const rows = [
    row({ id: "a", campaignId: "CAM-1" }),
    row({ id: "b", campaignId: "CAM-2" }),
    row({ id: "c", campaignId: "CAM-3" }),
    row({ id: "d", campaignId: "CAM-MISSING" }),   // แคมเปญถูกลบไปแล้ว
    row({ id: "e", campaignId: "" }),               // ไม่ได้ผูกแคมเปญ
  ];

  const all = mirrorableRows(rows, lookup, null, "t");
  // แถวที่ join กลับแคมเปญไม่ได้ ต้องไม่ถูกส่ง — แถวกำพร้าในชีตรายงานแย่กว่าแถวที่หายไป
  is("ตัดแถวที่หาแคมเปญไม่เจอ และแถวที่ไม่ผูกแคมเปญ", all.map((x) => x.row.id), ["a", "b", "c"]);
  is("แนบชื่อแคมเปญให้ถูกตัว", all.map((x) => x.ctx.campaignName), ["Wagyu Festival", "Cocktail Hour", "ไม่มีแบรนด์"]);

  const onlyTeppen = mirrorableRows(rows, lookup, ["teppen"] as BrandId[], "t");
  is("เลือกเฉพาะ teppen", onlyTeppen.map((x) => x.row.id), ["a"]);

  const two = mirrorableRows(rows, lookup, ["teppen", "touka"] as BrandId[], "t");
  is("เลือกสองแบรนด์", two.map((x) => x.row.id), ["a", "b"]);

  is("ปิด sync ทั้งหมด", mirrorableRows(rows, lookup, [] as BrandId[], "t").length, 0);
  is("ไม่มีแถวเลย", mirrorableRows([], lookup, null, "t").length, 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
