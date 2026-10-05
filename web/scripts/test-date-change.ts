// node --import tsx scripts/test-date-change.ts
import { requestDateChange, decideDateChange, type ContentItem } from "../src/lib/data/content";

let pass = 0, fail = 0;
const is = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log(`✗ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
const post = { id: "c1", day: 30, dateIso: "2026-09-30", time: "10:00", title: "T" } as ContentItem;

is("needs a reason", requestDateChange(post, { date: "2026-10-05", time: "10:00", reason: " " }, "Pupay"), null);
is("same slot is no ask", requestDateChange(post, { date: "2026-09-30", time: "10:00", reason: "x" }, "Pupay"), null);
const asked = requestDateChange(post, { date: "2026-10-05", time: "", reason: "event moved" }, "Pupay", "Pichayaporn")!;
is("ask keeps the date", asked.dateIso, "2026-09-30");
is("ask recorded", [asked.dateChangeRequest?.toDate, asked.dateChangeRequest?.toTime, asked.dateChangeRequest?.approver], ["2026-10-05", "10:00", "Pichayaporn"]);
is("no second ask while pending", requestDateChange(asked, { date: "2026-10-06", time: "10:00", reason: "y" }, "Pupay"), null);
const ok = decideDateChange(asked, "approve", "Pichayaporn")!;
is("approve moves date+day", [ok.dateIso, ok.day, ok.time, ok.dateChangeRequest], ["2026-10-05", 5, "10:00", undefined]);
const no = decideDateChange(asked, "reject", "Pichayaporn", "งานถ่ายแล้ว")!;
is("reject keeps date", [no.dateIso, no.dateChangeRequest], ["2026-09-30", undefined]);
is("reject logged", no.changeLog?.at(-1)?.action, "ไม่อนุมัติเลื่อนวันโพสต์");
is("withdraw clears", decideDateChange(asked, "withdraw", "Pupay")!.dateChangeRequest, undefined);
is("nothing pending", decideDateChange(post, "approve", "x"), null);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
