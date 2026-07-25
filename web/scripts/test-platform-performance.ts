/* The Platform Performance rollup — every number on that page comes out of
 * buildPlatformPerformance(), fed by briefs, content, graphics, KOLs, expenses and
 * tasks at once. The risk here is double-counting and mis-bucketing, so the tests
 * feed one known fact at a time and check where it lands.
 * Run: node --import tsx scripts/test-platform-performance.ts */

import {
  buildPlatformPerformance, normalizePerformancePlatform, platformDisplay, platformBrandNames,
  PERFORMANCE_PLATFORMS, PlatformPerformanceInput, PlatformPerformanceRow,
} from "../src/lib/data/performance";
import { emptyBrief, CampaignBrief } from "../src/lib/data/brief";
import { ContentItem } from "../src/lib/data/content";
import { Graphic } from "../src/lib/data/graphic";
import { Kol } from "../src/lib/data/kol";
import { Task } from "../src/lib/data/tasks";
import { CampaignRow } from "../src/lib/data/campaigns";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

const empty: PlatformPerformanceInput = {
  campaigns: [], briefs: {}, content: [], graphics: [], kols: [], expenseRequests: [], expenses: [], tasks: [],
};
const run = (over: Partial<PlatformPerformanceInput>) => buildPlatformPerformance({ ...empty, ...over });
const row = (over: Partial<PlatformPerformanceInput>, platform: string): PlatformPerformanceRow | undefined =>
  run(over).rows.find((x) => x.platform === platform);

const brief = (name: string, over: Partial<CampaignBrief> = {}): CampaignBrief => ({ ...emptyBrief(name), name, ...over });
const adsBrief = (name: string, lines: { platform: string; amount: number }[], b = "teppen"): CampaignBrief =>
  brief(name, { b, budget: { ...emptyBrief(name).budget, adsByPlatform: lines as never } });

const content = (over: Partial<ContentItem>): ContentItem => ({
  id: "c1", title: "post", b: "teppen", campaign: "C1", plat: "Instagram", platforms: [], owner: "Nok W.",
  status: "Draft", publishStatus: "Not scheduled", due: "", type: "Post",
  ...over,
} as unknown as ContentItem);

const graphic = (over: Partial<Graphic>): Graphic => ({
  id: 1, title: "kv", b: "teppen", campaign: "C1", platform: "Instagram", stage: "Request",
  owner: "Boss", due: "", blocker: null, deliverables: [],
  ...over,
} as unknown as Graphic);

const kol = (over: Partial<Kol>): Kol => ({
  id: 1, name: "Nong Aim", b: "teppen", campaign: "C1", plat: "Instagram", status: "Posted",
  fee: 0, totalCost: 0, paymentStatus: "Unpaid", posts: [], postLink: null, actualReach: 0, actualEngagement: 0, roi: 0,
  ...over,
} as unknown as Kol);

const task = (over: Partial<Task>): Task => ({
  id: 1, title: "Ads task", module: "Ads", type: "Ads", assignee: "Ken S.", brand: "Teppen", campaign: "C1",
  status: "In Progress", priority: "Med", group: "doFirst", due: "", blocker: null, pendingApprover: null,
  isQuickWin: false, nextAction: "", checklist: [], moduleIcon: "", moduleColor: "",
  ...over,
} as unknown as Task);

console.log("— normalizePerformancePlatform: จัดกลุ่มชื่อช่องทางที่คนกรอกมั่วๆ —");
is("Facebook", normalizePerformancePlatform("Facebook"), "Facebook / Instagram");
is("Instagram", normalizePerformancePlatform("Instagram"), "Facebook / Instagram");
is("Meta", normalizePerformancePlatform("Meta"), "Facebook / Instagram");
is("IG (ตัวย่อ)", normalizePerformancePlatform("IG"), "Facebook / Instagram");
is("FB (ตัวย่อ)", normalizePerformancePlatform("FB"), "Facebook / Instagram");
is("FB / IG", normalizePerformancePlatform("FB / IG"), "Facebook / Instagram");
is("TikTok", normalizePerformancePlatform("TikTok"), "TikTok");
is("Google", normalizePerformancePlatform("Google"), "Google");
is("YouTube นับเป็น Google", normalizePerformancePlatform("YouTube"), "Google");
is("Google Ads / PPC", normalizePerformancePlatform("Google Ads / PPC"), "Google");
is("Google Map แยกจาก Google", normalizePerformancePlatform("Google Map"), "Google Map");
is("GMB = Google Map", normalizePerformancePlatform("GMB"), "Google Map");
is("LINE Ads", normalizePerformancePlatform("LINE Ads"), "LINE Ads");
is("LINE OA", normalizePerformancePlatform("LINE OA"), "LINE OA");
is("LINE Broadcast = LINE OA", normalizePerformancePlatform("LINE Broadcast"), "LINE OA");
is("'LINE' เฉยๆ ตกไป LINE Ads", normalizePerformancePlatform("LINE"), "LINE Ads");
is("KOL", normalizePerformancePlatform("KOL"), "KOL / Creator");
is("Influencer = KOL", normalizePerformancePlatform("Influencer"), "KOL / Creator");
// KOL is checked before the platform names, so a creator on TikTok is KOL spend.
is("TikTok Creator นับเป็นงาน KOL ไม่ใช่ media", normalizePerformancePlatform("TikTok Creator"), "KOL / Creator");
is("ค่าว่าง → Other", normalizePerformancePlatform(""), "Other");
is("null → Other", normalizePerformancePlatform(null), "Other");
is("undefined → Other", normalizePerformancePlatform(undefined), "Other");
is("ชื่อที่ไม่รู้จัก → Other", normalizePerformancePlatform("Billboard BTS"), "Other");

console.log("\n— ข้อความธรรมดาต้องไม่ถูกเดาเป็นแพลตฟอร์ม —");
// Tasks classify on their free-text title when no channel is set. "ig" and "fb"
// as bare substrings turned ordinary words into Facebook / Instagram spend.
is("'Big campaign' ไม่ใช่ IG (คำว่า campaign มี ig)", normalizePerformancePlatform("Big campaign"), "Other");
is("'Design review' ไม่ใช่ IG", normalizePerformancePlatform("Design review"), "Other");
is("'Assign the brief' ไม่ใช่ IG", normalizePerformancePlatform("Assign the brief"), "Other");
is("'Weekly digest' ไม่ใช่ IG", normalizePerformancePlatform("Weekly digest"), "Other");
is("'Signage print' ไม่ใช่ IG", normalizePerformancePlatform("Signage print"), "Other");
is("แต่ 'IG Reel' ยังจับได้", normalizePerformancePlatform("IG Reel"), "Facebook / Instagram");
is("และ 'Instagram Reel' ยังจับได้", normalizePerformancePlatform("Instagram Reel"), "Facebook / Instagram");

console.log("\n— ตารางว่าง —");
{
  const { rows, summary } = run({});
  is("ไม่มีข้อมูล = ไม่มีแถว (ไม่โชว์แถวศูนย์ทุกแพลตฟอร์ม)", rows.length, 0);
  is("ยอดรวมเป็นศูนย์", [summary.totalBudget, summary.totalSpend, summary.totalContent], [0, 0, 0]);
  is("avgSyncScore ไม่หาร 0 (ต้องไม่ใช่ NaN)", summary.avgSyncScore, 0);
}

console.log("\n— งบจากบรีฟลงแพลตฟอร์มที่ถูกต้อง —");
{
  const briefs = { C1: adsBrief("C1", [{ platform: "Facebook", amount: 50000 }, { platform: "TikTok", amount: 30000 }]) };
  const fb = row({ briefs }, "Facebook / Instagram");
  is("งบ Facebook 50,000", fb?.plannedBudget, 50000);
  is("committed เท่ากับงบที่วางไว้", fb?.committed, 50000);
  is("งบ TikTok แยกแถว 30,000", row({ briefs }, "TikTok")?.plannedBudget, 30000);
  is("ยอดรวมงบ = 80,000", run({ briefs }).summary.totalBudget, 80000);
  is("แพลตฟอร์มที่ไม่มีงบไม่โผล่มาเป็นแถว", run({ briefs }).rows.map((r) => r.platform), ["Facebook / Instagram", "TikTok"]);
  is("ชื่อแคมเปญติดมากับแถว", fb?.campaigns, ["C1"]);
  is("แบรนด์ติดมากับแถว", fb?.brands, ["teppen"]);
}
{
  // Two platform lines naming the same platform must add up, not overwrite.
  const briefs = { C1: adsBrief("C1", [{ platform: "Facebook", amount: 10000 }, { platform: "IG", amount: 5000 }]) };
  is("Facebook + IG รวมเป็นแถวเดียว 15,000", row({ briefs }, "Facebook / Instagram")?.plannedBudget, 15000);
}
{
  const briefs = { C1: adsBrief("C1", [{ platform: "Facebook", amount: 0 }, { platform: "TikTok", amount: -500 }]) };
  is("บรรทัดที่งบ 0 หรือติดลบ ถูกข้าม", run({ briefs }).rows.length, 0);
}
{
  // Two campaigns on one platform: budgets add, campaign names accumulate.
  const briefs = {
    C1: adsBrief("C1", [{ platform: "Facebook", amount: 10000 }], "teppen"),
    C2: adsBrief("C2", [{ platform: "Facebook", amount: 20000 }], "touka"),
  };
  const fb = row({ briefs }, "Facebook / Instagram");
  is("สองแคมเปญรวมงบกัน", fb?.plannedBudget, 30000);
  is("เก็บชื่อทั้งสองแคมเปญ", fb?.campaigns, ["C1", "C2"]);
  is("เก็บทั้งสองแบรนด์", fb?.brands, ["teppen", "touka"]);
}

console.log("\n— งบ KOL หารตามจำนวนแพลตฟอร์ม แต่ไม่บวกซ้ำ —");
{
  const briefs = { C1: brief("C1", { kols: [{ name: "A", budget: 30000, platforms: ["Instagram", "TikTok", "Facebook"] }] as never }) };
  const k = row({ briefs }, "KOL / Creator");
  // Whatever the platform split, the KOL fee must total the fee once — this is
  // the double-count the per-platform loop invites.
  is("งบ KOL รวมยังเท่าเดิม 30,000 (ไม่คูณตามจำนวนแพลตฟอร์ม)", k?.plannedBudget, 30000);
  is("KOL ทุกแพลตฟอร์มถูกรวมไว้ที่แถว KOL / Creator", run({ briefs }).rows.length, 1);
}
{
  const briefs = { C1: brief("C1", { kols: [{ name: "A", budget: 20000, platforms: [] }] as never }) };
  is("KOL ที่ไม่ระบุแพลตฟอร์ม ยังนับเต็ม 20,000", row({ briefs }, "KOL / Creator")?.plannedBudget, 20000);
}
{
  const briefs = { C1: brief("C1", { kols: [{ name: "A", budget: 0, platforms: ["Instagram"] }] as never }) };
  is("KOL ที่ยังไม่ใส่งบ ถูกข้าม", run({ briefs }).rows.length, 0);
}

console.log("\n— คอนเทนต์: นับชิ้น และนับที่ลงแล้ว —");
{
  // Real publishStatus vocabulary: Published / Scheduled in OS / Queued / Draft.
  const items = [
    content({ id: "c1", plat: "Instagram", publishStatus: "Published", status: "Published" }),
    content({ id: "c2", plat: "Instagram", publishStatus: "Draft", status: "Draft" }),
    content({ id: "c3", plat: "TikTok", publishStatus: "Scheduled in OS", status: "Scheduled" }),
    content({ id: "c4", plat: "Facebook", publishStatus: "Queued", status: "Scheduled" }),
  ];
  is("นับคอนเทนต์ IG/FB 3 ชิ้น (Facebook รวมแถวเดียวกับ IG)", row({ content: items }, "Facebook / Instagram")?.contentCount, 3);
  is("ลงแล้ว 2 ชิ้น (Draft ไม่นับ)", row({ content: items }, "Facebook / Instagram")?.publishedContent, 2);
  is("'Scheduled in OS' นับว่าลงแล้ว", row({ content: items }, "TikTok")?.publishedContent, 1);
  is("ยอดรวมคอนเทนต์ 4", run({ content: items }).summary.totalContent, 4);
}
{
  // One item cross-posted counts on each platform it actually goes out on.
  const items = [content({ id: "c1", plat: "Instagram", platforms: ["Instagram", "TikTok"] })];
  is("ชิ้นเดียวลงสองแพลตฟอร์ม นับทั้งสองแถว",
    run({ content: items }).rows.map((r) => [r.platform, r.contentCount]),
    [["Facebook / Instagram", 1], ["TikTok", 1]]);
  is("ยอดรวมคอนเทนต์นับตามการลง ไม่ใช่จำนวนแถวคอนเทนต์", run({ content: items }).summary.totalContent, 2);
}

console.log("\n— งานกราฟฟิก: นับเฉพาะที่อนุมัติแล้ว + เก็บ blocker —");
{
  const gs = [
    graphic({ id: 1, platform: "Instagram", stage: "Approved" }),
    graphic({ id: 2, platform: "Instagram", stage: "Request" }),
    graphic({ id: 3, platform: "Instagram", stage: "Delivered" }),
  ];
  is("นับเฉพาะ Approved/Delivered = 2", row({ graphics: gs }, "Facebook / Instagram")?.approvedCreatives, 2);
}
{
  const gs = [graphic({ id: 1, platform: "TikTok", stage: "Approved", blocker: "รอ copy จาก Ken" })];
  is("blocker ถูกเก็บพร้อมชื่องาน", row({ graphics: gs }, "TikTok")?.blockers, ["kv: รอ copy จาก Ken"]);
  is("มี blocker แล้ว syncScore ต้องไม่เต็ม", (row({ graphics: gs }, "TikTok")?.syncScore ?? 100) < 100, true);
}
{
  // A blocker on its own is not "activity" — the row filter needs a real number
  // (budget/content/creative/spend) before a platform earns a line on the page.
  const gs = [graphic({ id: 1, platform: "TikTok", stage: "Request", blocker: "รอ copy" })];
  is("งานที่ยังไม่อนุมัติและไม่มีตัวเลขอื่น ไม่สร้างแถวเปล่า", run({ graphics: gs }).rows.length, 0);
}
{
  // Deliverables override the parent platform — a request can fan out per size.
  const gs = [graphic({ id: 1, platform: "Instagram", stage: "Approved", deliverables: [{ platform: "TikTok" }, { platform: "Facebook" }] as never })];
  is("ใช้แพลตฟอร์มของ deliverable ไม่ใช่ของใบคำขอ (เรียงตาม PERFORMANCE_PLATFORMS)",
    run({ graphics: gs }).rows.map((r) => [r.platform, r.approvedCreatives]),
    [["Facebook / Instagram", 1], ["TikTok", 1]]);
}

console.log("\n— KOL: reach/engagement และเงินที่จ่ายจริง —");
{
  const ks = [kol({ id: 1, plat: "Instagram", posts: [{ platform: "Instagram", link: "x", reach: 12000, engagement: 800 }] as never })];
  const k = row({ kols: ks }, "Facebook / Instagram");
  is("reach มาจากผลโพสต์", k?.kolReach, 12000);
  is("engagement มาจากผลโพสต์", k?.kolEngagement, 800);
  is("ยอดรวม reach", run({ kols: ks }).summary.totalReach, 12000);
}
{
  // No per-post numbers yet — fall back to the manually entered totals.
  const ks = [kol({ id: 1, plat: "TikTok", posts: [], actualReach: 5000, actualEngagement: 250, postLink: null })];
  is("ยังไม่มีผลรายโพสต์ ใช้ค่าที่กรอกไว้", row({ kols: ks }, "TikTok")?.kolReach, 5000);
}
{
  const paid = [kol({ id: 1, plat: "Instagram", fee: 20000, totalCost: 25000, paymentStatus: "Paid" })];
  const unpaid = [kol({ id: 2, plat: "Instagram", fee: 20000, totalCost: 25000, paymentStatus: "Unpaid" })];
  is("จ่ายแล้ว → เข้า actualSpend ตาม totalCost", row({ kols: paid }, "Facebook / Instagram")?.actualSpend, 25000);
  // "Unpaid" contains the word "paid" — a substring test books money that has not
  // left the account yet as spend.
  is("ยังไม่จ่าย (Unpaid) → actualSpend เป็น 0", row({ kols: unpaid }, "Facebook / Instagram")?.actualSpend, 0);
  is("แต่ค่าตัวยังผูกเป็น committed ไว้แล้ว", row({ kols: unpaid }, "Facebook / Instagram")?.committed, 20000);
  for (const status of ["Pending", "Not started", "Unpaid"]) {
    const ks = [kol({ id: 1, plat: "Instagram", fee: 20000, totalCost: 25000, paymentStatus: status })];
    is(`paymentStatus '${status}' ไม่นับเป็นเงินที่จ่ายแล้ว`, row({ kols: ks }, "Facebook / Instagram")?.actualSpend, 0);
  }
  is("totalCost ว่าง → ใช้ fee แทน",
    row({ kols: [kol({ id: 1, plat: "Instagram", fee: 18000, totalCost: 0, paymentStatus: "Paid" })] }, "Facebook / Instagram")?.actualSpend, 18000);
}
{
  // A KOL whose platform is unrecognisable is still KOL work, not "Other".
  const ks = [kol({ id: 1, plat: "Podcast", posts: [], actualReach: 100, postLink: null })];
  is("KOL แพลตฟอร์มแปลกๆ ไปลงแถว KOL / Creator ไม่ใช่ Other",
    run({ kols: ks }).rows.map((r) => r.platform), ["KOL / Creator"]);
}

console.log("\n— เงิน: คำขอเบิก vs ค่าใช้จ่ายจริง —");
{
  const reqs = [{ category: "Meta Ads", b: "teppen", campaign: "C1", requested: 40000, approved: 35000, due: "", status: "Approved" }] as never;
  is("ใช้ยอดที่อนุมัติ ไม่ใช่ยอดที่ขอ", row({ expenseRequests: reqs }, "Facebook / Instagram")?.committed, 35000);
}
{
  const reqs = [{ category: "Meta Ads", b: "teppen", campaign: "C1", requested: 40000, approved: 0, due: "", status: "Waiting Approval" }] as never;
  is("ยังไม่อนุมัติ ใช้ยอดที่ขอไปก่อน", row({ expenseRequests: reqs }, "Facebook / Instagram")?.committed, 40000);
}
{
  const exps = [{ vendor: "Meta", category: "Meta Ads", b: "teppen", amount: 33000, vat: 0, date: "", status: "Paid" }] as never;
  const r = row({ expenses: exps }, "Facebook / Instagram");
  is("ค่าใช้จ่ายจริงเข้า actualSpend", r?.actualSpend, 33000);
  // The spending log has no campaign column, so the row must not invent one.
  is("Spending Log ไม่มีคอลัมน์แคมเปญ → ไม่กุชื่อแคมเปญขึ้นมา", r?.campaigns, []);
  is("แต่ยังรู้ว่าเป็นแบรนด์ไหน", r?.brands, ["teppen"]);
  is("ยอดรวมใช้จ่าย", run({ expenses: exps }).summary.totalSpend, 33000);
}
{
  // Planned, committed and actual are three different columns and must not bleed.
  const briefs = { C1: adsBrief("C1", [{ platform: "Facebook", amount: 50000 }]) };
  const exps = [{ vendor: "Meta", category: "Meta Ads", b: "teppen", amount: 20000, vat: 0, date: "", status: "Paid" }] as never;
  const r = row({ briefs, expenses: exps }, "Facebook / Instagram");
  is("งบที่วางไว้ไม่ถูกยอดใช้จริงมาทับ", [r?.plannedBudget, r?.actualSpend], [50000, 20000]);
}

console.log("\n— งาน Ads: นับงานและงานที่ยังค้าง —");
{
  const ts = [
    task({ id: 1, channel: "Facebook", status: "In Progress" }),
    task({ id: 2, channel: "Facebook", status: "Done" }),
    task({ id: 3, channel: "TikTok", status: "Waiting" }),
  ];
  is("นับงาน Ads ของ Facebook = 2", row({ tasks: ts }, "Facebook / Instagram")?.adsTasks, 2);
  is("ค้างอยู่ 1 (Done ไม่นับ)", row({ tasks: ts }, "Facebook / Instagram")?.openTasks, 1);
  is("ยอดรวมงานค้าง = 2", run({ tasks: ts }).summary.openTasks, 2);
}
{
  const ts = [task({ id: 1, module: "Content", type: "Content", channel: "Facebook" })];
  is("งานที่ไม่ใช่สาย Ads ไม่ถูกนับ", run({ tasks: ts }).rows.length, 0);
}
{
  // channel is authoritative; the title is only a fallback.
  const ts = [task({ id: 1, title: "Boost the Instagram reel", channel: "TikTok" })];
  is("มี channel แล้วไม่ต้องเดาจากชื่องาน", run({ tasks: ts }).rows.map((r) => r.platform), ["TikTok"]);
}
{
  const ts = [task({ id: 1, title: "Refresh the campaign creative", channel: undefined })];
  is("ไม่มี channel และชื่องานเดาไม่ได้ → Other ไม่ใช่ IG",
    run({ tasks: ts }).rows.map((r) => r.platform), ["Other"]);
}

console.log("\n— syncScore + การเรียงลำดับ —");
{
  const briefs = { C1: adsBrief("C1", [{ platform: "Facebook", amount: 1000 }]) };
  const score = row({ briefs }, "Facebook / Instagram")?.syncScore ?? 0;
  is("syncScore เป็น 0–100", score >= 0 && score <= 100, true);
  is("syncScore เป็นจำนวนเต็ม", Number.isInteger(score), true);
}
{
  // Rows are ordered by money at stake so the biggest spend reads first.
  const briefs = {
    Small: adsBrief("Small", [{ platform: "TikTok", amount: 5000 }]),
    Big: adsBrief("Big", [{ platform: "Facebook", amount: 500000 }]),
    Mid: adsBrief("Mid", [{ platform: "Google", amount: 50000 }]),
  };
  is("เรียงจากเงินมากไปน้อย",
    run({ briefs }).rows.map((r) => r.platform), ["Facebook / Instagram", "Google", "TikTok"]);
}

console.log("\n— ROAS ไม่หารศูนย์ —");
{
  const campaigns = [{ name: "C1", spend: 100000, roi: 3, b: "teppen" }] as unknown as CampaignRow[];
  const briefs = { C1: adsBrief("C1", [{ platform: "Facebook", amount: 100000 }]) };
  const r = row({ campaigns, briefs }, "Facebook / Instagram");
  is("ROAS คิดจากรายได้ ÷ เงินที่ลง", r?.roas, 3);
  is("ROAS เป็นตัวเลขจริง ไม่ใช่ NaN/Infinity", Number.isFinite(r?.roas ?? NaN), true);
}
{
  // No campaign row to attribute revenue to — ROAS must be 0, not NaN.
  const briefs = { C1: adsBrief("C1", [{ platform: "Facebook", amount: 100000 }]) };
  is("ไม่มีแคมเปญให้จับคู่ → ROAS = 0", row({ briefs }, "Facebook / Instagram")?.roas, 0);
}

console.log("\n— ป้ายชื่อที่แสดงบนตาราง —");
{
  const base = { platform: "KOL / Creator", brands: [], campaigns: [] } as unknown as PlatformPerformanceRow;
  is("KOL / Creator แสดงหมวดบัญชีคู่กัน", platformDisplay(base), "KOL / Creator · KOL / Influencer");
  is("LINE OA แสดงหมวด LINE Broadcast",
    platformDisplay({ ...base, platform: "LINE OA" } as PlatformPerformanceRow), "LINE OA · LINE Broadcast");
  is("TikTok แสดงหมวด TikTok Ads",
    platformDisplay({ ...base, platform: "TikTok" } as PlatformPerformanceRow), "TikTok · TikTok Ads");
  // "Other" has no accounting category of its own, so it must not read "Other · Other".
  is("แถวที่ชื่อตรงกับหมวดอยู่แล้ว ไม่ต้องเขียนซ้ำ",
    platformDisplay({ ...base, platform: "Other" } as PlatformPerformanceRow), "Other");
  is("แถวที่ไม่มีแบรนด์ อ่านว่า All Brands", platformBrandNames(base), "All Brands");
  is("มีแบรนด์แล้วแสดงชื่อจริง",
    platformBrandNames({ ...base, brands: ["teppen", "touka"] } as PlatformPerformanceRow), "TEPPEN, Touka");
}

console.log("\n— ทุกค่าที่ normalize ออกมา ต้องเป็นแพลตฟอร์มที่ประกาศไว้ —");
{
  const junk = ["", "???", "Billboard", "อีเมล", "LINE", "youtube shorts", "meta reels", "kol tiktok"];
  is("ไม่มีค่าไหนหลุดออกนอก PERFORMANCE_PLATFORMS",
    junk.filter((x) => !PERFORMANCE_PLATFORMS.includes(normalizePerformancePlatform(x))), []);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
