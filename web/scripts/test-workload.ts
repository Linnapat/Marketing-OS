/* Runtime tests for Team Workload — who the board says needs help.
 * The old rule was `open >= 8`, a headcount of rows: someone with eight trivial
 * items looked like an emergency while someone blocked for a fortnight read as
 * "healthy". These pin the replacement: blocked-or-buried, weighed in pieces of
 * artwork and expressed in days at the team's own pace (3–4 pieces/day).
 * Run with:  npm test   (chained after test-artwork-report.ts)
 * Same self-contained assert harness as the other suites — no runner needed. */

import { teamFromDb, PIECES_PER_DAY } from "../src/lib/data/derive";
import { Task } from "../src/lib/data/tasks";
import { Graphic, GraphicDeliverable } from "../src/lib/data/graphic";
import type { Member } from "../src/lib/db/settings";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  check(name, actual === expected);
}

const member = (name: string, role = "Senior Graphic Designer"): Member =>
  ({ name, email: `${name.toLowerCase()}@x.co`, role, access: "Editor", brandAccess: "All brands", status: "Active", color: "#000" }) as Member;

let seq = 0;
const task = (assignee: string, over: Partial<Task> = {}): Task => ({
  id: ++seq, title: `t${seq}`, module: "Graphic", moduleIcon: "🎨", moduleColor: "#C2691E", type: "Graphic",
  assignee, brand: "Teppen", campaign: "C", status: "In Progress", priority: "Med", group: "doFirst",
  due: "Aug 5", blocker: null, pendingApprover: null, isQuickWin: false, nextAction: "", checklist: [], ...over,
});

const del = (size: string): GraphicDeliverable => ({
  platform: "Instagram", size, refLink: "", assetLink: "", sourceLink: "", status: "Not submitted",
  version: 0, submittedBy: "", submittedAt: "", feedback: [],
});
const graphic = (id: number, sizes: string[]): Graphic => ({
  id, stage: "In Progress", title: `g${id}`, b: "teppen", campaign: "C", due: "Aug 5", designer: "Ann",
  requester: "Ken", approver: "Gik", type: "Photo", priority: "Med", fb: 0, openFb: 0, isOverdue: false,
  briefComplete: true, pendingApprover: "—", blocker: null, waitingSince: "", nextAction: "",
  platform: "IG", size: sizes.join(" · "), contentItem: "—", deliverables: sizes.map(del), history: [],
});

console.log("\n— blocked work means help, whatever the count —");
{
  // The case the old rule got backwards: few rows, but stuck.
  const team = teamFromDb([member("Ann")], [task("Ann", { status: "Stuck", blocker: "รอ copy จาก Ken" })], []);
  const ann = team.members[0];
  is("one blocked task = needs support", ann.load, "needsSupport");
  check("…and the row says why", ann.reason.includes("ติดอยู่"));
  is("…even though only 1 task is open", ann.open, 1);
}
{
  // …and its mirror: several rows, all flowing and all small. The old rule
  // called 6 open tasks "busy" (>=5) and 8 an emergency; at 3.5 pieces/day six
  // small pieces is under two days — a normal queue, not a cry for help.
  const tasks = Array.from({ length: 6 }, () => task("Ann"));
  const team = teamFromDb([member("Ann")], tasks, []);
  is("6 small flowing tasks = 1.7 days", team.members[0].days, 1.7);
  is("…which is healthy, not busy", team.members[0].load, "healthy");
}

console.log("\n— volume is weighed in pieces, not rows —");
{
  // One request holding 4 sizes is 4 pieces ≈ a full day, not "1 task".
  const g = graphic(1, ["1:1", "4:5", "9:16", "16:9"]);
  const team = teamFromDb([member("Ann")], [task("Ann", { relatedGraphicId: "1" })], [], [g]);
  is("a 4-size request weighs 4 pieces", team.members[0].pieces, 4);
  is("…which is about a day of work", team.members[0].days, Math.round((4 / PIECES_PER_DAY) * 10) / 10);
  is("…still just one open task", team.members[0].open, 1);
}
{
  // Same size on two platforms is one file — artworkUnits collapses it, and the
  // workload must not disagree with what the billing report counts.
  const g: Graphic = { ...graphic(2, []), deliverables: [
    { ...del("1:1"), platform: "Facebook" }, { ...del("1:1"), platform: "Instagram" },
  ] };
  const team = teamFromDb([member("Ann")], [task("Ann", { relatedGraphicId: "2" })], [], [g]);
  is("one file used twice weighs one piece", team.members[0].pieces, 1);
}
{
  const team = teamFromDb([member("Ann")], [task("Ann", { module: "Content", relatedGraphicId: undefined })], []);
  is("non-graphic work weighs one", team.members[0].pieces, 1);
  is("no graphics passed = still works", team.members[0].load, "healthy");
}

console.log("\n— the thresholds, in days at the team's pace —");
{
  // 7 pieces = 2 days = the busy line.
  const g = graphic(3, ["1:1", "4:5", "9:16", "16:9", "2:3", "3:2", "5:4"]);
  const team = teamFromDb([member("Ann")], [task("Ann", { relatedGraphicId: "3" })], [], [g]);
  is("7 pieces", team.members[0].pieces, 7);
  is("= 2 days", team.members[0].days, 2);
  is("…which reads as busy", team.members[0].load, "busy");
}
{
  // >4 days of backlog is more than a week's runway: buried, not busy.
  const sizes = Array.from({ length: 15 }, (_, i) => `size-${i}`);
  const g = graphic(4, sizes);
  const team = teamFromDb([member("Ann")], [task("Ann", { relatedGraphicId: "4" })], [], [g]);
  is("15 pieces ≈ 4.3 days", team.members[0].days, 4.3);
  is("…is needs support", team.members[0].load, "needsSupport");
  check("…and says it's over a week", team.members[0].reason.includes("วันทำงาน"));
}
{
  const team = teamFromDb([member("Ann")], [task("Ann"), task("Ann")], []);
  is("2 pieces is a healthy day", team.members[0].load, "healthy");
  check("…and says there's room", team.members[0].reason.includes("รับเพิ่มได้"));
}
{
  const overdue = task("Ann", { dueIso: "2020-01-01" });
  const team = teamFromDb([member("Ann")], [overdue], []);
  is("an overdue item lifts a quiet queue to busy", team.members[0].load, "busy");
  check("…and names it", team.members[0].reason.includes("เลยกำหนด"));
}

console.log("\n— everyone's own work counts as their own —");
{
  // The collapse bug: a brief item spawns a Content task (writer) and a Graphic
  // task (designer). Collapsed, only the Graphic assignee survived — the writer's
  // task vanished from their workload and they looked free.
  const writer = task("Ken", { module: "Content", type: "Content", briefTaskKey: "brief-1:content:item-1" });
  const designer = task("Ann", { module: "Graphic", type: "Graphic", briefTaskKey: "brief-1:graphic:item-1" });
  const team = teamFromDb([member("Ken", "Content Creator"), member("Ann")], [writer, designer], []);
  is("the writer keeps their task", team.members.find((m) => m.name === "Ken")?.open, 1);
  is("the designer keeps theirs", team.members.find((m) => m.name === "Ann")?.open, 1);
  // Team totals still collapse, so the pair is one piece of work, not two.
  is("team totals don't double-count the pair", team.pulse.done + team.pulse.stuckTasks, 0);
}
{
  const team = teamFromDb([member("Ann")], [task("Nobody"), task("Ann")], []);
  const orphan = team.members.find((m) => m.name === "Unassigned");
  is("work with no real owner gets its own row", orphan?.open, 1);
  is("…and isn't dumped on a real person", team.members.find((m) => m.name === "Ann")?.open, 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
