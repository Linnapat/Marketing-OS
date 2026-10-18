/* Runtime tests for the deadline board + its reminder schedule.
 * Run with:  npm test */

import {
  deadlineBoard, dueReminders, countdownLabel, daysBetween, stateOf, reminderText,
  SOON_DAYS, REMIND_BEFORE, deadlinesLandingIn, shiftMonth, MILESTONE_ROUTE,
  finalBriefDeadline, withFinalBrief, BOARD_ONLY,
} from "../src/lib/data/deadlineBoard";
import { MILESTONES, type MilestoneDeadline } from "../src/lib/data/deadlinePolicy";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

const m = (key: string, iso: string, label = key): MilestoneDeadline => ({
  key: key as MilestoneDeadline["key"], label, governs: `ส่ง ${label}`,
  iso, day: Number(iso.slice(8, 10)), fromMonth: iso.slice(0, 7), forMonth: iso.slice(0, 7),
});

console.log("\n— นับวันที่เหลือ —");
is("วันเดียวกัน = 0", daysBetween("2026-09-10", "2026-09-10"), 0);
is("พรุ่งนี้ = 1", daysBetween("2026-09-10", "2026-09-11"), 1);
is("เมื่อวาน = -1", daysBetween("2026-09-10", "2026-09-09"), -1);
is("ข้ามเดือนนับถูก", daysBetween("2026-08-30", "2026-09-02"), 3);
// เทียบที่เที่ยงคืนเสมอ — ไม่งั้นเวลาในวันจะทำให้ "วันนี้" กลายเป็น "พรุ่งนี้"
is("มีเวลาต่อท้ายก็ยังนับเป็นวัน", daysBetween("2026-09-10T18:30:00Z", "2026-09-10"), 0);
is("วันที่อ่านไม่ออก = null", daysBetween("2026-09-10", "ไม่ใช่วันที่"), null);

console.log("\n— สถานะของแต่ละเส้นตาย —");
is("เลยกำหนดแล้ว", stateOf(-1), "overdue");
is("วันนี้", stateOf(0), "today");
is("ใกล้แล้ว", stateOf(SOON_DAYS), "soon");
is("ยังมีเวลา", stateOf(SOON_DAYS + 1), "ahead");

console.log("\n— บอร์ดเดือนนี้ —");
{
  const board = deadlineBoard([
    m("finalAw", "2026-09-20", "Final AW"),
    m("campaignBrief", "2026-09-05", "Campaign Brief"),
    m("contentPlan", "2026-09-10", "Content Plan"),
  ], "2026-09-08");
  is("เรียงตามวันที่ ไม่ใช่ตามลำดับที่ส่งเข้ามา", board[0].label, "Campaign Brief");
  is("อันที่เลยมาแล้วยังอยู่บนบอร์ด", board[0].state, "overdue");
  is("…และบอกว่าเลยมากี่วัน", board[0].daysLeft, -3);
  is("อันที่ใกล้ถึงขึ้น soon", board[1].state, "soon");
  is("อันที่ยังไกลขึ้น ahead", board[2].state, "ahead");

  // วันที่พัง = ไม่เอาขึ้นบอร์ด ดีกว่าประกาศเส้นตายที่วางบนปฏิทินไม่ได้
  is("วันที่อ่านไม่ออกถูกตัดทิ้ง", deadlineBoard([m("finalAw", "")], "2026-09-08").length, 0);
}

console.log("\n— คำบอกเวลา —");
is("วันนี้", countdownLabel(0), "วันนี้");
is("พรุ่งนี้", countdownLabel(1), "พรุ่งนี้");
is("อีกหลายวัน", countdownLabel(5), "อีก 5 วัน");
is("เลยมาวันเดียว", countdownLabel(-1), "เลยมา 1 วัน");
is("เลยมาหลายวัน", countdownLabel(-4), "เลยมา 4 วัน");

console.log("\n— เตือนเฉพาะจุดที่ตั้งไว้ —");
{
  const at = (days: number) => {
    const base = Date.parse("2026-09-10T00:00:00Z") + days * 86_400_000;
    return new Date(base).toISOString().slice(0, 10);
  };
  const rows = deadlineBoard(
    [3, 2, 1, 0, -1, 5].map((d, i) => m(`k${i}`, at(d), `งาน ${d}`)),
    "2026-09-10",
  );
  const due = dueReminders(rows);
  is("เตือน 3 จุด: 3 วัน / พรุ่งนี้ / วันนี้", due.length, 3);
  is("จุดที่เตือนตรงตามตาราง", due.map((r) => r.daysLeft).sort((a, b) => a - b).join(","), REMIND_BEFORE.slice().sort((a, b) => a - b).join(","));
  // เลยกำหนดแล้วไม่เตือนซ้ำทุกคืน — บอร์ดขึ้นแดงไว้แล้ว ที่เหลือเป็นเรื่องต้องคุยกัน
  is("เลยกำหนดแล้วไม่ยิงเตือน", due.some((r) => r.daysLeft < 0), false);
  is("ยังไกลเกินก็ไม่เตือน", due.some((r) => r.daysLeft === 5), false);
}

console.log("\n— ข้อความเตือน —");
{
  const row = deadlineBoard([m("finalAw", "2026-09-11", "Final AW")], "2026-09-10")[0];
  is("บอกทั้งเมื่อไหร่ ทำอะไร และวันที่", reminderText(row), "⏰ พรุ่งนี้: Final AW — ส่ง Final AW (กำหนด 11/09)");
}

console.log("\n— เดดไลน์ที่ 'ตกในเดือนนี้' ไม่ใช่ 'ของงานเดือนนี้' —");
{
  is("บวกเดือนข้ามปีได้", shiftMonth("2026-11", 3), "2027-02");
  is("เดือนที่อ่านไม่ออกคืนค่าเดิม", shiftMonth("อะไรนะ", 2), "อะไรนะ");

  // บรีฟของงานเดือน ก.ย. ครบกำหนดตั้งแต่ มิ.ย. — บอร์ดเดือน มิ.ย. ต้องเห็นมัน
  // ส่วนบอร์ดเดือน ก.ย. ต้องไม่เห็น (วันนั้นผ่านไปแล้วตั้งแต่สามเดือนก่อน)
  const table: Record<string, { key: string; iso: string }[]> = {
    "2026-06": [],
    "2026-07": [],
    "2026-08": [{ key: "campaignBrief", iso: "2026-06-12" }],
    "2026-09": [{ key: "campaignBrief", iso: "2026-07-10" }, { key: "finalAw", iso: "2026-08-25" }],
  };
  const resolve = (forMonth: string) =>
    (table[forMonth] ?? []).map((r) => ({ ...m(r.key, r.iso, r.key), forMonth }));

  const june = deadlinesLandingIn("2026-06", resolve);
  is("บอร์ดเดือน มิ.ย. เห็นบรีฟที่ครบกำหนด มิ.ย.", june.length, 1);
  is("…และรู้ว่ามันเป็นงานของเดือนไหน", june[0].forMonth, "2026-08");

  const aug = deadlinesLandingIn("2026-08", resolve);
  is("บอร์ดเดือน ส.ค. เห็น Final AW ของงานเดือน ก.ย.", aug.length, 1);
  is("…ไม่ใช่บรีฟที่ผ่านไปแล้ว", aug[0].key, "finalAw");

  // ตัวเดียวกันโผล่จากหลาย forMonth ต้องไม่ซ้ำ
  const dup = deadlinesLandingIn("2026-07", (fm) => fm === "2026-07" || fm === "2026-08"
    ? [{ ...m("contentPlan", "2026-07-05"), forMonth: "2026-09" }] : []);
  is("ไม่ขึ้นซ้ำ", dup.length, 1);
}

console.log("\n— ทุกเดดไลน์ต้องมีปลายทาง —");
{
  // กับดักที่เจอตอนทำ: campaign brief เป็นของสายการตลาด ซึ่ง "ไม่มีห้อง" ใน Slack เลย
  // ถ้าส่งเข้าห้องอย่างเดียว เตือนตัวที่ทุกเดดไลน์อื่นรออยู่จะหายไปเงียบ ๆ
  // ยกเว้นตัวที่ตั้งใจให้อยู่บนบอร์ดอย่างเดียว (BOARD_ONLY) — ต้องประกาศไว้ชัด ๆ
  for (const key of [...MILESTONES.map((d) => d.key), "finalBrief" as const]) {
    const route = MILESTONE_ROUTE[key];
    if (BOARD_ONLY.includes(key)) {
      is(`${key} อยู่บนบอร์ดอย่างเดียว ไม่ยิง Slack`, route.rooms.length + route.roles.length, 0);
      continue;
    }
    is(`${key} มีปลายทาง`, !!route && (route.rooms.length + route.roles.length) > 0, true);
  }
  is("บรีฟส่งถึงคน ไม่ใช่ห้อง", MILESTONE_ROUTE.campaignBrief.roles.length > 0, true);
  // CMO ขอ ต.ค. 69: ห้อง graphic/vdo เตือน Final Brief แทน Final AW
  is("Final Brief ถึงทั้ง graphic และ vdo", MILESTONE_ROUTE.finalBrief.rooms.join(","), "graphic,vdo");
  is("Final AW ไม่เข้าห้อง graphic/vdo แล้ว", MILESTONE_ROUTE.finalAw.rooms.length, 0);
}

console.log("\n— Final Brief มาจากเดดไลน์ส่งบรีฟ (brief_cutoff_day) —");
{
  // ค่าจริงบน prod = 16: งานเดือน พ.ย. ต้องบรีฟภายใน 16 ต.ค.
  const nov = finalBriefDeadline("2026-11", 16);
  is("งานเดือน พ.ย. → บรีฟภายใน 16 ต.ค.", nov?.iso, "2026-10-16");
  is("…รู้ว่าเป็นงานเดือนไหน", nov?.forMonth, "2026-11");
  is("ข้ามปีได้: งาน ม.ค. → ธ.ค. ปีก่อน", finalBriefDeadline("2027-01", 16)?.iso, "2026-12-16");
  is("วันเกินเดือนสั้น → วันสุดท้ายของเดือน", finalBriefDeadline("2027-03", 31)?.iso, "2027-02-28");
  is("ปิดกติกา (0) = ไม่มีเดดไลน์", finalBriefDeadline("2026-11", 0), null);

  // ลงบอร์ด/เตือนผ่านทางเดียวกับ milestone อื่น
  const landed = deadlinesLandingIn("2026-10", withFinalBrief(() => [], 16));
  is("บอร์ดเดือน ต.ค. เห็น Final Brief ของงาน พ.ย. ตัวเดียว", landed.map((d) => `${d.key}:${d.iso}`).join(","), "finalBrief:2026-10-16");

  // ข้อความที่ห้อง graphic/vdo จะได้ เย็นวันที่ 13 ต.ค.
  const row = deadlineBoard(landed, "2026-10-13")[0];
  is("ข้อความเตือนห้อง graphic/vdo", reminderText(row), "⏰ อีก 3 วัน: Final Brief — ส่ง Final Brief งาน Graphic / VDO ให้ Creative (กำหนด 16/10)");
  is("…และอยู่ในรอบที่ต้องเตือน", dueReminders([row]).length, 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
