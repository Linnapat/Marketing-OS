/* สรุปผล KOL ตามรูปแบบรายงานเดิม (Monthly Branch Report)
 *
 * ตัวเลขในเทสต์ยึดจากรายงานจริงที่ Gik ส่งมา (TO_Phuket 2026-07) เพื่อให้
 * หน้าในแอปกับชีตเดิมตรงกัน — ถ้าสองที่ไม่ตรง คนจะกลับไปใช้ชีต
 * Run: node --import tsx scripts/test-kol-summary.ts */

import { buildKolSummary, DEFAULT_TARGETS, SummaryTargets } from "../src/lib/data/kolSummary";
import type { Kol } from "../src/lib/data/kol";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}
const near = (name: string, actual: number, expected: number, tol = 0.01) => {
  if (Math.abs(actual - expected) <= tol) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${actual}\n      expected: ~${expected}`); }
};

/** One creator with results already reported. */
const k = (over: Partial<Kol>): Kol => ({
  id: 1, name: "x", h: "@x", plat: "TikTok", b: "teppen", branch: "TO_Phuket",
  campaign: "Teppen On the beach", kolType: "Food Review", followers: 0,
  expectedReach: 0, actualReach: 0, visits: 0, fee: 0, foodCost: 0, totalCost: 0,
  owner: "", ownerTeam: "", pendingApprover: "", currentBlocker: null, status: "Posted",
  waitingSince: null, postDueDate: "", postedDate: null, openComments: 0, latestComment: "",
  isOverdue: false, couponCode: null, contractStatus: "", quotationStatus: "", invoiceStatus: "",
  paymentStatus: "", financeReqId: "", paymentDue: "", roi: 0, audienceFit: "", contentStyle: "",
  contactInfo: "", pastCollab: "", objective: "", target: "", keyMsg: "", offer: "",
  postingPeriod: "", engagement: "", saves: "", shares: "", postLink: null, stages: [],
  ...over,
} as Kol);

// รายงานจริง TO_Phuket 2026-07: 3 KOL · reach 184,338 · engage 7,807 · cost ฿33,850
// KPI 30,000 · pages 3 · budget 20,000 · visit rate 0.002 · ARPU 800
const PHUKET: SummaryTargets = { kpiReach: 30000, pagesNeeded: 3, budget: 20000, visitRate: 0.002, arpu: 800 };
const phuketRows = [
  k({ id: 219, name: "กฤษครับอยู่ภูเก็ต", followers: 65692, fee: 7500, foodCost: 4540, totalCost: 12040,
      posts: [{ platform: "TikTok", link: "a", reach: 15300, engagement: 963 }] }),
  k({ id: 217, name: "ChewChewPhuket", followers: 154200, fee: 10000, foodCost: 4660, totalCost: 14660,
      posts: [{ platform: "TikTok", link: "b", reach: 162600, engagement: 6694 }] }),
  k({ id: 220, name: "EatPhuket", followers: 32400, fee: 3000, foodCost: 4150, totalCost: 7150,
      posts: [{ platform: "TikTok", link: "c", reach: 6438, engagement: 150 }] }),
];

console.log("— ตรงกับรายงานจริง TO_Phuket 2026-07 —");
{
  const s = buildKolSummary(phuketRows, PHUKET);
  is("KOL Used", s.kolUsed, 3);
  is("Total Reach", s.reach, 184338);
  is("Total Engage", s.engage, 7807);
  is("Total Cost", s.cost, 33850);
  near("Cost / Reach = 0.1836", s.costPerReach, 0.1836, 0.0001);
  near("Engage Rate = 4.2%", s.engageRate, 4.23, 0.05);
  near("Budget Used vs Request = 169.3%", s.budgetUsedPct, 169.25, 0.1);
  // reach × 0.002 × 800 ÷ cost = 294,940 ÷ 33,850 ≈ 8.7 (ชีตปัดเป็น 9)
  near("ROAS (est.) ≈ 8.7", s.roasEst, 8.71, 0.05);
  is("Sum Follower", s.followers, 252292);
  near("Reach / Follower = 0.73", s.reachPerFollower, 0.7307, 0.001);
}

console.log("\n— ตาราง Branch —");
{
  const s = buildKolSummary(phuketRows, PHUKET);
  is("สาขาเดียว = แถวเดียว", s.branches.length, 1);
  is("ชื่อสาขา", s.branches[0].branch, "TO_Phuket");
  is("ยอดสาขาตรงกับยอดรวม", [s.branches[0].reach, s.branches[0].engage, s.branches[0].cost], [184338, 7807, 33850]);

  // หลายสาขา: เรียง reach มากไปน้อย ไม่ใช่เรียงตามตัวอักษร — สาขาที่แบกเดือนนั้น
  // ต้องอยู่บนสุด
  const multi = [
    ...phuketRows,
    k({ id: 300, branch: "TO_Ekkamai", followers: 10000, totalCost: 5000,
        posts: [{ platform: "IG", link: "d", reach: 1000, engagement: 10 }] }),
    k({ id: 301, branch: "ไม่ระบุสาขา", followers: 5000, totalCost: 1000, branch2: undefined } as Partial<Kol>),
  ];
  const m = buildKolSummary(multi as Kol[], PHUKET);
  is("สาขาที่ reach สูงสุดอยู่บน", m.branches[0].branch, "TO_Phuket");
  is("นับทุกสาขา", m.branches.length, 3);
  is("สาขาว่างถูกจัดเป็น 'ไม่ระบุสาขา' ไม่ใช่ค่าว่าง", m.branches.some((b) => b.branch === "ไม่ระบุสาขา"), true);
}

console.log("\n— Engage Rate: ห้ามลอกสูตรที่พังจากบล็อกบนของชีต —");
{
  // บล็อกบนของชีตขึ้น 1033.2% สำหรับ engage 6,736 บน reach 69,595 ซึ่งคือ 9.68%
  // (บล็อกรายเดือนของชีตเองคิดถูก) — แอปต้องคิดถูกเสมอ
  const rows = [k({ id: 1, totalCost: 28607, followers: 100000, posts: [{ platform: "TikTok", link: "z", reach: 69595, engagement: 6736 }] })];
  const s = buildKolSummary(rows, { ...DEFAULT_TARGETS, budget: 80000 });
  near("engage rate = 9.68% ไม่ใช่ 1033.2%", s.engageRate, 9.68, 0.01);
  near("Cost/Reach = 0.41", s.costPerReach, 0.411, 0.001);
  near("Budget Used = 35.8%", s.budgetUsedPct, 35.76, 0.05);
}

console.log("\n— หารศูนย์: ยังไม่มีผล ต้องได้ 0 ไม่ใช่ Infinity/NaN —");
{
  const blank = buildKolSummary([k({ id: 1, totalCost: 5000 })], DEFAULT_TARGETS);
  is("cost/reach = 0", blank.costPerReach, 0);
  is("engage rate = 0", blank.engageRate, 0);
  is("reach/follower = 0", blank.reachPerFollower, 0);
  is("ไม่ได้ตั้ง budget = 0 ไม่ใช่ Infinity", blank.budgetUsedPct, 0);
  is("ไม่ได้ตั้ง KPI = 0", blank.kpiPct, 0);
  is("ROAS est = 0", blank.roasEst, 0);
  is("ไม่มีแถวเลย", buildKolSummary([], DEFAULT_TARGETS).kolUsed, 0);
}

console.log("\n— ตาราง Campaign Detail —");
{
  const rows = [
    k({ id: 2, name: "B", campaign: "Zeta", fee: 100, foodCost: 50, totalCost: 150,
        visitDate: "2026-08-20", postedDate: "2026-08-25",
        posts: [{ platform: "TikTok", link: "p", reach: 1000, engagement: 100 }] }),
    k({ id: 3, name: "A", campaign: "Alpha", totalCost: 0 }),
  ];
  const s = buildKolSummary(rows, DEFAULT_TARGETS);
  is("เรียงตามแคมเปญ แล้วตามชื่อ", s.details.map((d) => `${d.campaign}/${d.name}`), ["Alpha/A", "Zeta/B"]);

  // KOL ID มาจากทะเบียน ไม่ใช่จากใบจอง — ใบที่ยังไม่ผูกโปรไฟล์ต้องเป็นค่าว่าง
  // ไม่ใช่เลขมั่ว
  const withCodes = buildKolSummary(
    [k({ id: 9, name: "C", campaign: "Alpha", masterKolId: "m-9" }), k({ id: 10, name: "D", campaign: "Alpha" })],
    DEFAULT_TARGETS,
    (kk) => (kk.masterKolId === "m-9" ? "KOL-0219" : undefined),
  );
  is("ผูกทะเบียนแล้ว = ได้รหัส", withCodes.details.find((d) => d.name === "C")?.code, "KOL-0219");
  is("ยังไม่ผูกทะเบียน = ไม่มีรหัส ไม่ใช่เลขมั่ว", withCodes.details.find((d) => d.name === "D")?.code, "");
  is("ไม่ส่ง codeFor มาเลย ก็ไม่พัง", buildKolSummary([k({ id: 11 })], DEFAULT_TARGETS).details[0].code, "");
  const b = s.details.find((d) => d.name === "B")!;
  is("แยกค่าอาหารกับค่าตัว", [b.paidCost, b.foodCost, b.totalCost], [100, 50, 150]);
  is("วันไปร้าน + วันโพสต์ แยกคอลัมน์", [b.visitDate, b.postDate], ["2026-08-20", "2026-08-25"]);
  near("engage rate ต่อคน = 10%", b.engageRate, 10, 0.001);
  near("cost/reach ต่อคน = 0.15", b.costPerReach, 0.15, 0.001);
}

console.log("\n— นับโพสต์ที่ยังไม่กรอกผล —");
{
  const rows = [k({ id: 1, posts: [
    { platform: "TikTok", link: "a", reach: 100, engagement: 5 },
    { platform: "IG", link: "b", reach: 0, engagement: 0 },
  ] })];
  const s = buildKolSummary(rows, DEFAULT_TARGETS);
  is("2 โพสต์ กรอกผลแล้ว 1", [s.posts, s.postsReported], [2, 1]);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
