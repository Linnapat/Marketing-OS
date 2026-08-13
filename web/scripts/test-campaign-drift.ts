/* The campaigns row and the brief it carries must never disagree.
 * Run: node --import tsx scripts/test-campaign-drift.ts
 *
 * The bug this guards: status and total budget exist twice — as a column on the
 * campaigns row (what the list, Finance and the dashboards read) and inside the
 * brief blob (what the Campaign Builder loads). A writer that moved only the
 * column left the two disagreeing, and because Edit → Save writes the WHOLE
 * brief back over the row, the stale copy won: the change reverted with nothing
 * to show it happened.
 *
 * Live damage this comes from:
 *   Mother's Day       row "Approved" (17 ก.ค.) · brief still "Waiting for
 *                      Approval", and no approval entry in its log at all
 *   Seasonal menu      row ฿6,000 · plan still ฿12,000
 *   Unlimited Side Dish row "Active" — a status no part of the app knows, so its
 *                      plan was neither approved (no work created) nor waiting
 *                      (invisible to every approval queue)
 */

import { briefStatusPatch, briefBudgetPatch, patchCampaignRowIO, BriefBlob, CampaignRowIO } from "../src/lib/db/campaigns";
import { BRIEF_STATUSES } from "../src/lib/data/brief";
import { CAMPAIGN_STATUS_TONE } from "../src/lib/status";
import { STATUS_ORDER } from "../src/lib/data/campaigns";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n    expected ${e}\n         got ${a}`); }
}

const AT = "2026-08-07T04:12:00.000Z";
const base = (): BriefBlob => ({
  id: "CAM-2026-5818",
  name: "Mother's Day",
  status: "Waiting for Approval",
  budget: { total: 12000, ads: 5000, kol: 7000, monthly: [{ month: "2026-08", amount: 12000 }] },
  approvalLog: [{ action: "Submitted for approval", by: "Orapan", at: "2026-07-15T12:03:46.008Z" }],
});

console.log("\nstatus reaches the brief, not just the column");
{
  const next = briefStatusPatch(base(), "Approved", "Gik", AT)!;
  is("brief carries the new status", next.status, "Approved");
  is("approval log gained one entry", (next.approvalLog as unknown[]).length, 2);
  is("the entry says who, when, and from where", (next.approvalLog as Record<string, unknown>[])[1],
    { action: "Status changed to Approved", by: "Gik", at: AT, from: "Waiting for Approval", to: "Approved" });
  is("the rest of the brief is untouched", next.budget, base().budget);
  is("the original blob is not mutated", base().status, "Waiting for Approval");
}

console.log("\nno change means no write");
{
  is("same status → nothing to patch", briefStatusPatch(base(), "Waiting for Approval", "Gik", AT), null);
  is("same budget → nothing to patch", briefBudgetPatch(base(), 12000, "Gik", AT), null);
}

console.log("\nan approved budget revision lands in the plan");
{
  const next = briefBudgetPatch(base(), 6000, "Gik", AT)!;
  is("plan cap follows the revision", next.budget?.total, 6000);
  is("the allocation buckets are left for the planner", [next.budget?.ads, next.budget?.kol], [5000, 7000]);
  is("the revision is on the record", (next.approvalLog as Record<string, unknown>[])[1],
    { action: "Budget revised", by: "Gik", at: AT, comment: "Total budget 12,000 → 6,000 บาท" });
}

console.log("\nbriefs written before these fields existed still patch");
{
  const bare: BriefBlob = { id: "CAM-2026-4064", name: "Unlimited Side Dish" };
  const next = briefStatusPatch(bare, "Waiting for Approval", "", AT)!;
  is("status set on a brief that had none", next.status, "Waiting for Approval");
  is("log created from nothing", (next.approvalLog as unknown[]).length, 1);
  is("unknown actor reads as —", (next.approvalLog as Record<string, unknown>[])[0].by, "—");
  const budgeted = briefBudgetPatch(bare, 6000, "Gik", AT)!;
  is("budget object created from nothing", budgeted.budget, { total: 6000 });
  // A blob whose approvalLog is not an array (hand-edited, or an older shape)
  // must not make the whole status change throw.
  const broken: BriefBlob = { status: "Draft", approvalLog: "n/a" as unknown as unknown[] };
  is("a non-array log is replaced, not spread", (briefStatusPatch(broken, "Approved", "Gik", AT)!.approvalLog as unknown[]).length, 1);
}

console.log("\nevery status the app can set is one the app can render");
{
  const untoned = BRIEF_STATUSES.filter((s) => !CAMPAIGN_STATUS_TONE[s]);
  is("all have a status colour", untoned, []);
  // The campaigns list renders group-by-status from STATUS_ORDER; a status
  // missing here has no group to appear in, so the campaign vanishes from the
  // list rather than showing up under its own heading.
  const ungrouped = BRIEF_STATUSES.filter((s) => !STATUS_ORDER.includes(s));
  is("all have a group on the campaigns list", ungrouped, []);
}

/** A campaigns row that behaves like the real one: every write bumps the
 *  version, and a guarded write that no longer matches changes nothing. */
function fakeRow(opts: { blob: BriefBlob | null; versioned?: boolean; missing?: boolean; interleave?: (blob: BriefBlob) => BriefBlob }) {
  const state = { blob: opts.blob, version: opts.versioned === false ? undefined : "v0", writes: [] as Record<string, unknown>[], reads: 0 };
  let interleaved = false;
  const io: CampaignRowIO = {
    async read() {
      state.reads++;
      // Simulate the other person's save landing between our read and our write:
      // it happens once, right after the first read, and moves the version on.
      if (opts.interleave && !interleaved) {
        interleaved = true;
        const seen = { found: !opts.missing, blob: state.blob, seen: state.version };
        state.blob = state.blob ? opts.interleave(state.blob) : state.blob;
        state.version = "v-other";
        return seen;
      }
      return { found: !opts.missing, blob: state.blob, seen: state.version };
    },
    async write(payload, guard) {
      if (guard && guard !== state.version) return [];
      state.writes.push(payload);
      if ("data" in payload) state.blob = payload.data as BriefBlob;
      state.version = `v${state.writes.length}`;
      return [{ updated_at: state.version }];
    },
  };
  return { io, state };
}

// The retry loop is async, and tsx compiles these scripts to CJS — no
// top-level await, so the concurrency cases run inside main().
async function main() {
console.log("\nthe row and the brief move in one write");
{
  const { io, state } = fakeRow({ blob: base() });
  const written = await patchCampaignRowIO(io, { status: "Approved", next_approval: "None" },
    (b) => briefStatusPatch(b, "Approved", "Gik", AT), "เปลี่ยนสถานะแคมเปญไม่สำเร็จ");
  is("one write, not two", state.writes.length, 1);
  is("column and blob in the same payload",
    [state.writes[0].status, (state.writes[0].data as BriefBlob).status], ["Approved", "Approved"]);
  is("the version is handed back to be adopted", written, [{ updated_at: "v1" }]);
}

console.log("\nsomeone else saving first does not lose their work");
{
  // They renamed the campaign while we were changing its status.
  const { io, state } = fakeRow({ blob: base(), interleave: (b) => ({ ...b, name: "Mother's Day 2026" }) });
  await patchCampaignRowIO(io, { status: "Approved" }, (b) => briefStatusPatch(b, "Approved", "Gik", AT), "ล้มเหลว");
  is("the stale attempt wrote nothing", state.writes.length, 1);
  is("we read again before retrying", state.reads, 2);
  is("their rename survived", (state.blob as BriefBlob).name, "Mother's Day 2026");
  is("our status landed", (state.blob as BriefBlob).status, "Approved");
  is("one log entry, not one per attempt", ((state.blob as BriefBlob).approvalLog as unknown[]).length, 2);
}

console.log("\ngiving up is loud, never a silent no-op");
{
  // A row that moves on every single read — the write can never match.
  const state = { n: 0 };
  const io: CampaignRowIO = {
    async read() { state.n++; return { found: true, blob: base(), seen: `v${state.n}` }; },
    async write() { return []; },
  };
  let message = "";
  try { await patchCampaignRowIO(io, { status: "Approved" }, (b) => briefStatusPatch(b, "Approved", "Gik", AT), "เปลี่ยนสถานะแคมเปญไม่สำเร็จ"); }
  catch (e) { message = (e as Error).message; }
  is("the caller is told to try again", message, "เปลี่ยนสถานะแคมเปญไม่สำเร็จ — มีคนแก้แคมเปญนี้อยู่พร้อมกัน ลองใหม่อีกครั้ง");
  is("it stopped instead of hammering the row", state.n, 3);
}

console.log("\ncampaigns with no brief, and rows that are not there");
{
  const { io, state } = fakeRow({ blob: null });
  await patchCampaignRowIO(io, { status: "Completed" }, (b) => briefStatusPatch(b, "Completed", "Gik", AT), "ล้มเหลว");
  is("the column still moves", state.writes[0], { status: "Completed" });
  is("no blob is invented", state.blob, null);

  // Nothing to patch (the brief already says it) → an unguarded column write,
  // so a version that moved in the meantime cannot block a no-op.
  const same = fakeRow({ blob: base(), interleave: (b) => ({ ...b, name: "renamed" }) });
  await patchCampaignRowIO(same.io, { status: "Waiting for Approval" },
    (b) => briefStatusPatch(b, "Waiting for Approval", "Gik", AT), "ล้มเหลว");
  is("column-only write is not version-guarded", same.state.writes, [{ status: "Waiting for Approval" }]);

  const missing = fakeRow({ blob: base(), missing: true });
  let message = "";
  try { await patchCampaignRowIO(missing.io, { status: "Approved" }, (b) => briefStatusPatch(b, "Approved", "Gik", AT), "เปลี่ยนสถานะแคมเปญไม่สำเร็จ"); }
  catch (e) { message = (e as Error).message; }
  is("a deleted / RLS-hidden campaign says so", message,
    "เปลี่ยนสถานะแคมเปญไม่สำเร็จ — ไม่พบแคมเปญนี้ (อาจถูกลบ หรือคุณไม่มีสิทธิ์แก้)");
  is("and nothing was written", missing.state.writes.length, 0);
}

}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}, (error) => {
  console.error("\n  ✗ FAIL: the test itself threw\n", error);
  process.exit(1);
});
