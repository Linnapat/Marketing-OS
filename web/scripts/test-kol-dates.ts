/* วันที่กับการเตือนในโมดูล KOL
 *
 * สามอย่างที่เคยรายงานเลขผิดแบบเงียบ ๆ:
 *   - postedDate แบบ "Jun 15" เข้า new Date() แล้วได้ปี 2001 (ไม่ใช่ Invalid
 *     Date) เลยน้อยกว่า due ทุกกรณี → On-time ขึ้น 100% ทั้งที่โพสต์สาย
 *   - label ไม่มีปี ถ้าเดาเป็นปีปัจจุบันเสมอ งานที่สายค้างข้ามปีจะหลุด
 *     Overdue ทันทีที่ขึ้นปีใหม่
 *   - kolAlerts เทียบ status ดิบ ทำให้ "Draft Submitted" ไม่ขึ้นเตือน
 * Run: node --import tsx scripts/test-kol-dates.ts */

import { kolMetrics, computeKolOverdue, kolAlerts } from "../src/lib/data/kol";
import type { Kol } from "../src/lib/data/kol";
import { inDateFilter, DateFilter } from "../src/components/ui/DateFilterBar";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

const k = (over: Partial<Kol>): Kol => ({
  id: 1, name: "x", h: "@x", plat: "TikTok", b: "teppen", branch: "", campaign: "C",
  kolType: "", followers: 0, expectedReach: 0, actualReach: 0, visits: 0,
  fee: 0, foodCost: 0, totalCost: 0, owner: "", ownerTeam: "", pendingApprover: "",
  currentBlocker: null, status: "Producing", waitingSince: null, postDueDate: "",
  postedDate: null, openComments: 0, latestComment: "", isOverdue: false, couponCode: null,
  contractStatus: "", quotationStatus: "", invoiceStatus: "", paymentStatus: "",
  financeReqId: "", paymentDue: "", roi: 0, audienceFit: "", contentStyle: "",
  contactInfo: "", pastCollab: "", objective: "", target: "", keyMsg: "", offer: "",
  postingPeriod: "", engagement: "", saves: "", shares: "", postLink: null,
  history: [], stages: [], ...over,
});

console.log("\n— On-time: label date ต้องไม่ถูกอ่านเป็นปี 2001 —");
is("โพสต์สาย 16 วัน = 0", kolMetrics(k({ postDueDate: "May 30", postedDate: "Jun 15", status: "Posted" })).onTime, 0);
is("โพสต์ก่อนกำหนด = 1", kolMetrics(k({ postDueDate: "Jun 30", postedDate: "Jun 15", status: "Posted" })).onTime, 1);
is("โพสต์วันครบกำหนดพอดี = 1", kolMetrics(k({ postDueDate: "Jun 30", postedDate: "Jun 30", status: "Posted" })).onTime, 1);
is("ISO ยังทำงานเหมือนเดิม", kolMetrics(k({ postDueDate: "2026-05-30", postedDate: "2026-06-15", status: "Posted" })).onTime, 0);
is("อ่านวันไม่ออก = ไม่ตัดสิน", kolMetrics(k({ postDueDate: "May 30", postedDate: "soon", status: "Posted" })).onTime, null);
is("ยังไม่ได้โพสต์ = ไม่ตัดสิน", kolMetrics(k({ postDueDate: "May 30" })).onTime, null);

console.log("\n— Overdue: label ไม่มีปี ต้องเดาปีที่ใกล้วันนี้ที่สุด —");
const dec20 = k({ postDueDate: "Dec 20" });
is("งานครบกำหนด ธ.ค. ยังสายอยู่ตอน 5 ม.ค. ปีถัดไป", computeKolOverdue(dec20, new Date(2027, 0, 5, 12)), true);
is("งานครบกำหนด ธ.ค. ยังไม่สายตอน ส.ค. ปีเดียวกัน", computeKolOverdue(dec20, new Date(2026, 7, 24, 12)), false);
is("งานของ ม.ค. ปีหน้า ไม่สายตอน ธ.ค. ปีนี้", computeKolOverdue(k({ postDueDate: "Jan 5" }), new Date(2026, 11, 20, 12)), false);
is("โพสต์แล้ว ไม่นับสาย", computeKolOverdue(k({ postDueDate: "Dec 20", status: "Posted" }), new Date(2027, 0, 5, 12)), false);
is("Paused ไม่นับสาย", computeKolOverdue(k({ postDueDate: "Dec 20", status: "Paused" }), new Date(2027, 0, 5, 12)), false);
is("ไม่มีวันครบกำหนด ไม่นับสาย", computeKolOverdue(k({ postDueDate: "TBD" }), new Date(2027, 0, 5, 12)), false);

console.log("\n— Needs Attention: เทียบ stage ไม่ใช่ status ดิบ —");
const draft = k({ id: 1, status: "Draft Submitted", postDueDate: "TBD" });
const waiting = k({ id: 2, status: "Waiting Review", postDueDate: "TBD" });
const talking = k({ id: 3, status: "Negotiating", postDueDate: "TBD" });
is("Draft Submitted + Waiting Review ขึ้นเตือน, Negotiating ไม่ขึ้น",
  kolAlerts([draft, waiting, talking]).map((x) => x.id), [1, 2]);
is("มีคอมเมนต์ค้างก็ขึ้นเตือน", kolAlerts([k({ id: 9, status: "Negotiating", openComments: 1, postDueDate: "TBD" })]).map((x) => x.id), [9]);

console.log("\n— ตัวกรองเดือน: \"TBD\" ไม่ใช่วันที่ —");
const august = { mode: "month", year: 2026, month: 7, start: "", end: "" } as DateFilter;
is("\"TBD\" = ไม่มีวัน จึงไม่ถูกซ่อน", inDateFilter(august, "TBD"), true);
is("วันโพสต์ ก.ย. ถูกกรองออกจากเดือน ส.ค.", inDateFilter(august, "Sep 10"), false);
is("วันโพสต์ ส.ค. อยู่ในเดือน ส.ค.", inDateFilter(august, "Aug 15"), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
