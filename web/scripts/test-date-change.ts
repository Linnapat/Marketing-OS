// node --import tsx scripts/test-date-change.ts
import { requestDateChange, decideDateChange, withPublishQueue, canPublish, publishStatusNotice, isPostClosed, contentTone, type ContentItem } from "../src/lib/data/content";
import { isPostOpenWork } from "../src/lib/data/derive";
import { contentHealth } from "../src/lib/data/statusBoard";

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

// Hold / Cancelled — set by hand in the Publish column.
const ready = { ...post, captionStatus: "Approved", assetStatus: "Approved", approvalStatus: "Approved", publishStatus: "Draft", status: "Draft" } as ContentItem;
is("signed-off draft still queues", withPublishQueue(ready).publishStatus, "Queued");
is("a held post is not re-queued", withPublishQueue({ ...ready, publishStatus: "Hold" }).publishStatus, "Hold");
is("a cancelled post is not re-queued", withPublishQueue({ ...ready, publishStatus: "Cancelled" }).publishStatus, "Cancelled");
is("held post cannot be published", canPublish({ ...ready, publishStatus: "Hold" }).ok, false);
is("cancelled post cannot be published", canPublish({ ...ready, publishStatus: "Cancelled" }).ok, false);
is("cancelled is closed, hold is not", [isPostClosed({ ...ready, publishStatus: "Cancelled" }), isPostClosed({ ...ready, publishStatus: "Hold" })], [true, false]);
is("cancelled is nobody's backlog; hold still is", [isPostOpenWork({ publishStatus: "Cancelled" }), isPostOpenWork({ publishStatus: "Hold" })], [false, true]);
is("cancelled reads done on the board, not blocked", contentHealth({ ...ready, captionStatus: "Missing", publishStatus: "Cancelled" }).health, "done");
is("hold reads waiting", contentHealth({ ...ready, publishStatus: "Hold" }).health, "waiting");
is("tones", [contentTone("Hold"), contentTone("Cancelled")], ["gold", "red"]);

// What the people producing for the post are told.
is("cancel tells producers to stop", publishStatusNotice("Queued", "Cancelled")?.stop, true);
is("hold tells producers to stop", publishStatusNotice("Draft", "Hold")?.stop, true);
is("un-hold tells them to carry on", publishStatusNotice("Hold", "Draft")?.stop, false);
is("re-opening a cancelled post is news too", publishStatusNotice("Cancelled", "Queued")?.stop, false);
is("the reason travels with the notice", publishStatusNotice("Draft", "Hold", "รอราคาใหม่")?.text.includes("รอราคาใหม่"), true);
is("ordinary moves are not news", publishStatusNotice("Draft", "Queued"), null);
is("no change is not news", publishStatusNotice("Hold", "Hold"), null);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
