/* Monthly / annual budget per brand, rolled up from the Finance budget Google
 * Sheet. A row naming a brand that Settings no longer lists used to turn the whole
 * column into NaN, so the guards matter more than the arithmetic.
 * Run: node --import tsx scripts/test-budget-sheet.ts */

import { budgetByBrandFromSheet, annualBudgetByBrandFromSheet, currentBudgetMonthKey, currentBudgetYearKey, BudgetSheetRow } from "../src/lib/db/budgetSheet";
import { BRAND_ORDER, emptyBrandTotals } from "../src/lib/brands";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}
const r = (month: string, brand: string | undefined, budget: number, category = "Ads"): BudgetSheetRow =>
  ({ month, brand, budget, category } as BudgetSheetRow);

console.log("— คีย์เดือน/ปีปัจจุบัน —");
{
  const now = new Date();
  is("รูปแบบเดือนเป็น YYYY-MM", /^\d{4}-\d{2}$/.test(currentBudgetMonthKey()), true);
  is("เดือนเป็น 1-based เติม 0 หน้า",
    currentBudgetMonthKey(), `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  is("ปีเป็น YYYY", currentBudgetYearKey(), String(now.getFullYear()));
  is("คีย์เดือนขึ้นต้นด้วยคีย์ปี", currentBudgetMonthKey().startsWith(currentBudgetYearKey() + "-"), true);
}

console.log("\n— รวมงบรายเดือนต่อแบรนด์ —");
{
  const rows = [
    r("2026-07", "teppen", 500000),
    r("2026-07", "teppen", 200000, "KOL"),
    r("2026-07", "touka", 150000),
    r("2026-08", "teppen", 900000),
  ];
  const july = budgetByBrandFromSheet(rows, "2026-07");
  is("หลายหมวดของแบรนด์เดียวกันถูกบวกรวม", july.teppen, 700000);
  is("แบรนด์อื่นแยกกัน", july.touka, 150000);
  is("เดือนอื่นไม่ปนเข้ามา", july.mainichi, 0);
  is("เลือกอีกเดือนได้ยอดของเดือนนั้น", budgetByBrandFromSheet(rows, "2026-08").teppen, 900000);
  is("เดือนที่ไม่มีข้อมูล = ศูนย์ทุกแบรนด์", budgetByBrandFromSheet(rows, "2026-12"), emptyBrandTotals());
}

console.log("\n— แถวที่ต้องข้าม —");
{
  // "all" is a filter value, not a brand — counting it double-books the total.
  const rows = [r("2026-07", "all", 1000000), r("2026-07", "teppen", 500000)];
  const out = budgetByBrandFromSheet(rows, "2026-07");
  is("แถว brand='all' ไม่ถูกนับ", out.teppen, 500000);
  is("ไม่มีคีย์ 'all' ในผลลัพธ์", Object.keys(out).includes("all"), false);
  is("ยอดรวมทุกแบรนด์ = 500,000 (ไม่บวก all ซ้ำ)",
    Object.values(out).reduce((s, n) => s + n, 0), 500000);
}
{
  const rows = [r("2026-07", undefined, 300000), r("2026-07", "", 200000), r("2026-07", "teppen", 100000)];
  is("แถวที่ไม่ระบุแบรนด์ถูกข้าม", budgetByBrandFromSheet(rows, "2026-07").teppen, 100000);
  is("รวมทั้งหมดได้แค่แถวที่ระบุแบรนด์",
    Object.values(budgetByBrandFromSheet(rows, "2026-07")).reduce((s, n) => s + n, 0), 100000);
}
{
  // A brand deleted from Settings still appears in old sheet rows. Reading an
  // unknown key gives undefined, and `undefined + n` is NaN — which would blank
  // the whole budget column, not just that brand.
  const rows = [r("2026-07", "sushizen", 400000), r("2026-07", "teppen", 100000)];
  const out = budgetByBrandFromSheet(rows, "2026-07");
  is("แบรนด์ที่ถูกลบไปแล้ว ไม่ทำให้ยอดกลายเป็น NaN", out.teppen, 100000);
  is("ไม่มีค่า NaN หลุดออกมาเลย", Object.values(out).every((n) => Number.isFinite(n)), true);
  is("แบรนด์ที่ config ไม่รู้จัก ยังถูกเก็บยอดไว้ (ไม่หายเงียบ)", out.sushizen, 400000);
}
{
  const rows = [r("2026-07", "teppen", 0), r("2026-07", "teppen", NaN), r("2026-07", "teppen", 250000)];
  is("งบ 0 / NaN ไม่ทำให้ยอดพัง", budgetByBrandFromSheet(rows, "2026-07").teppen, 250000);
}
{
  const rows = [r("2026-07", "teppen", -50000), r("2026-07", "teppen", 200000)];
  // A negative line is a correction; it should net off rather than be dropped.
  is("ยอดติดลบ (ปรับปรุงรายการ) หักออกจริง", budgetByBrandFromSheet(rows, "2026-07").teppen, 150000);
}
is("ชีตว่าง = ศูนย์ทุกแบรนด์", budgetByBrandFromSheet([], "2026-07"), emptyBrandTotals());

console.log("\n— รวมงบรายปีต่อแบรนด์ —");
{
  const rows = [
    r("2026-01", "teppen", 100000),
    r("2026-06", "teppen", 200000),
    r("2026-12", "teppen", 300000),
    r("2025-07", "teppen", 999999),
    r("2027-01", "teppen", 888888),
  ];
  is("รวมทุกเดือนในปีนั้น", annualBudgetByBrandFromSheet(rows, "2026").teppen, 600000);
  is("ปีก่อนหน้าไม่ปนเข้ามา", annualBudgetByBrandFromSheet(rows, "2025").teppen, 999999);
  is("ปีถัดไปไม่ปนเข้ามา", annualBudgetByBrandFromSheet(rows, "2027").teppen, 888888);
  is("ปีที่ไม่มีข้อมูล = ศูนย์", annualBudgetByBrandFromSheet(rows, "2024"), emptyBrandTotals());
}
{
  // Matching must be on the "YYYY-" prefix, not a bare substring, or 2026 rows
  // would pull in anything merely containing "2026".
  const rows = [r("2026-07", "teppen", 100000), r("2016-2026", "teppen", 500000)];
  is("จับคู่ปีด้วย prefix 'YYYY-' ไม่ใช่ substring",
    annualBudgetByBrandFromSheet(rows, "2026").teppen, 100000);
}
{
  const rows = [r("2026-07", "teppen", 100000), r("2026-07", "touka", 50000), r("2026-08", "touka", 50000)];
  const out = annualBudgetByBrandFromSheet(rows, "2026");
  is("แยกยอดรายแบรนด์ถูกต้อง", [out.teppen, out.touka], [100000, 100000]);
  is("มีคีย์ครบทุกแบรนด์ที่ config ไว้", Object.keys(out).sort(), [...BRAND_ORDER].sort());
}

console.log("\n— รายเดือนกับรายปีต้องสอดคล้องกัน —");
{
  const rows = BRAND_ORDER.flatMap((b, i) =>
    ["01", "02", "03"].map((m) => r(`2026-${m}`, b, (i + 1) * 10000)));
  const annual = annualBudgetByBrandFromSheet(rows, "2026");
  const monthly = ["01", "02", "03"].map((m) => budgetByBrandFromSheet(rows, `2026-${m}`));
  is("ผลรวมสามเดือน = ยอดรายปี",
    BRAND_ORDER.every((b) => monthly.reduce((s, mm) => s + mm[b], 0) === annual[b]), true);
  is("ทุกแบรนด์ได้ยอดรายปีตามที่ตั้งไว้",
    BRAND_ORDER.map((b) => annual[b]), BRAND_ORDER.map((_, i) => (i + 1) * 30000));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
