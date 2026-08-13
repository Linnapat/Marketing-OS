// Data access for Campaigns. Reads Supabase when configured, else the mock.

import { supabase } from "@/lib/supabase";
import { CAMPAIGNS, CampaignRow, Readiness } from "@/lib/data/campaigns";
import { BrandId, brandName } from "@/lib/brands";
import { assertDbOk } from "@/lib/db/assert";
import { mirrorRowToSheet } from "@/lib/db/sheetMirror";
import { DEFAULT_APPROVER } from "@/lib/approval";
import { logAudit } from "@/lib/db/audit";
import { liveOnly, trashReady } from "@/lib/db/trash";
import { adoptBriefVersion, forgetBriefVersion } from "@/lib/db/briefVersion";

type Row = {
  id: string; name: string; brand: BrandId; branch: string; owner: string;
  budget: number; spend: number; roi: number; dates: string; status: string;
  // Nullable: rows written before campaign_flight_dates.sql have only `dates`.
  start_date: string | null; end_date: string | null;
  camp_type: string; readiness: string;
  task_blocked: number; task_waiting: number; task_overdue: number;
  task_total: number; task_done: number; task_in_progress: number;
  bottleneck_team: string; next_approval: string;
  data: { code?: string; legacyCode?: string; previousCode?: string } | null;
};

const toCampaign = (r: Row): CampaignRow => ({
  id: r.id, code: r.data?.code, legacyCode: r.data?.legacyCode, previousCode: r.data?.previousCode,
  name: r.name, b: r.brand, branch: r.branch, owner: r.owner,
  budget: Number(r.budget), spend: Number(r.spend), roi: Number(r.roi), dates: r.dates,
  startDate: r.start_date ?? undefined, endDate: r.end_date ?? undefined,
  status: r.status, campType: r.camp_type, readiness: (r.readiness as Readiness) ?? "ready",
  taskBlocked: r.task_blocked, taskWaiting: r.task_waiting, taskOverdue: r.task_overdue,
  taskTotal: r.task_total, taskDone: r.task_done, taskInProgress: r.task_in_progress,
  bottleneckTeam: r.bottleneck_team, nextApproval: r.next_approval,
});

/** All campaigns — from Supabase if configured, else the mock. */
export async function fetchCampaigns(): Promise<CampaignRow[]> {
  const db = supabase();
  if (!db) return CAMPAIGNS.map((c) => ({ ...c }));
  const { data, error } = await liveOnly(db.from("campaigns").select("*"), await trashReady()).order("id");
  // In production, never fall back to demo campaigns when Supabase is present.
  // A query error should read as "no live campaign data" instead of showing
  // sample work that has already been cleared for real usage.
  if (error || !data) return [];
  return (data as Row[]).map(toCampaign);
}

/** Team-shared custom campaign types (added by admins). Empty if not configured
 *  or the table doesn't exist yet. */
export async function fetchCampaignTypes(): Promise<string[]> {
  const db = supabase();
  if (!db) return [];
  const { data, error } = await db.from("campaign_types").select("name").order("name");
  if (error || !data) return [];
  return data.map((r) => r.name as string);
}

/** Add a shared campaign type (admin only — the UI gates this). */
export async function addCampaignType(name: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("campaign_types").upsert({ name });
  assertDbOk(error, "Could not save campaign type");
}

/** Does this error mean the database simply doesn't have one of these columns
 *  yet? Postgres says 42703; PostgREST answers from its schema cache with
 *  PGRST204 and names the column in the message. Anything else is a real
 *  failure and must not be swallowed. */
function isUnknownColumn(error: { code?: string; message?: string }, ...columns: string[]): boolean {
  if (error.code !== "42703" && error.code !== "PGRST204") return false;
  const message = error.message ?? "";
  return columns.some((column) => message.includes(column));
}

/** Insert a new campaign; returns it. */
export async function createCampaign(c: CampaignRow): Promise<CampaignRow> {
  const db = supabase();
  if (!db) return c;
  // On an existing campaign this upsert is an UPDATE, which moves updated_at —
  // and saveCampaignBrief writes the brief blob straight after it. Adopting the
  // version here is what stops our own row-write from reading as somebody else's
  // edit two lines later (see db/briefVersion).
  const base = {
    id: c.id, name: c.name, brand: c.b, branch: c.branch, owner: c.owner, budget: c.budget, spend: c.spend,
    roi: c.roi, dates: c.dates, status: c.status, camp_type: c.campType, readiness: c.readiness,
    task_blocked: c.taskBlocked, task_waiting: c.taskWaiting, task_overdue: c.taskOverdue,
    task_total: c.taskTotal, task_done: c.taskDone, task_in_progress: c.taskInProgress,
    bottleneck_team: c.bottleneckTeam, next_approval: c.nextApproval,
  };
  const save = (payload: Record<string, unknown>) =>
    db.from("campaigns").upsert(payload, { onConflict: "id" }).select("id, updated_at");

  let { data: written, error } = await save({
    ...base, start_date: c.startDate ?? null, end_date: c.endDate ?? null,
  });
  // The flight columns arrive with campaign_flight_dates.sql, and a deploy can
  // land before someone runs it. Saving a campaign is not allowed to depend on
  // that ordering, so an unknown column means write what this database HAS —
  // `dates` still carries the flight, and the migration backfills the columns
  // from the brief blob whenever it does run.
  if (error && isUnknownColumn(error, "start_date", "end_date")) {
    ({ data: written, error } = await save(base));
  }
  assertDbOk(error, "Could not save campaign");
  adoptBriefVersion(c.id, written as { updated_at?: string }[] | null);
  mirrorCampaignToSheet(c);
  return c;
}

/** Best-effort mirror of a new campaign into the campaign Google Sheet, via our
 *  server route → Apps Script Web App. Fire-and-forget: any failure is swallowed
 *  so a Sheet hiccup never blocks (or reverts) a campaign save. Only runs in the
 *  browser — the server has no relative-URL base for the fetch. */
// Columns of the reporting template's Campaigns tab, in order.
export const CAMPAIGN_SHEET_HEADERS = [
  "campaign_id", "campaign_name", "brand", "branch",
  "KPI", "start", "end", "budget_plan", "notes",
];

function mirrorCampaignToSheet(c: CampaignRow): void {
  // Prefer the stored dates — the sheet gets real ISO ends instead of a label
  // it would have to parse. Falling back to splitting `dates` keeps campaigns
  // written before those columns mirroring exactly as they used to. KPI/notes
  // aren't tracked at campaign level, so they're left blank for the team.
  const [labelStart, labelEnd] = (c.dates || "").split(/[–—-]/).map((s) => s.trim());
  const start = c.startDate ?? labelStart;
  const end = c.endDate ?? labelEnd;
  mirrorRowToSheet("Campaigns", CAMPAIGN_SHEET_HEADERS, [
    c.id, c.name, brandName(c.b), c.branch, "", start || c.dates || "", end || "", c.budget, "",
  ], c.b);
}

/** The blob half of a campaigns row: the brief, as stored. Typed loosely here on
 *  purpose — db/brief imports THIS module, so importing the brief types back
 *  would close an import cycle. Only the two fields these patches touch are
 *  named; everything else rides along untouched. */
export type BriefBlob = Record<string, unknown> & {
  status?: string;
  budget?: Record<string, unknown> & { total?: number };
  approvalLog?: unknown[];
};

/** Append to the brief's approval log without assuming it is there — briefs
 *  written before the log existed have no array, and one bad blob must not make
 *  a status change throw. */
function withLogEntry(blob: BriefBlob, entry: Record<string, unknown>): unknown[] {
  return [...(Array.isArray(blob.approvalLog) ? blob.approvalLog : []), entry];
}

/** The brief as it should read after a status change, or null when the brief
 *  already says that — an approval log full of "Status changed to Approved"
 *  repeated by every retry is noise, and rewriting an identical blob would bump
 *  the row version under whoever else is editing. Pure, so the sequencing is
 *  testable without a database. */
export function briefStatusPatch(blob: BriefBlob, status: string, by: string, at: string): BriefBlob | null {
  if (blob.status === status) return null;
  return {
    ...blob,
    status,
    approvalLog: withLogEntry(blob, {
      action: `Status changed to ${status}`, by: by || "—", at, from: blob.status ?? "", to: status,
    }),
  };
}

/** The brief as it should read after a CMO-approved budget revision, or null
 *  when the plan already carries that cap. The rest of `budget` (per-bucket
 *  allocation, monthly split, ads-by-platform) is deliberately left as it is:
 *  re-allocating is the planner's decision, and the Builder already warns when
 *  the parts no longer add up to the total. */
export function briefBudgetPatch(blob: BriefBlob, budget: number, by: string, at: string): BriefBlob | null {
  const before = Number(blob.budget?.total ?? 0);
  if (before === budget) return null;
  return {
    ...blob,
    budget: { ...(blob.budget ?? {}), total: budget },
    approvalLog: withLogEntry(blob, {
      action: "Budget revised", by: by || "—", at,
      comment: `Total budget ${before.toLocaleString("en-US")} → ${budget.toLocaleString("en-US")} บาท`,
    }),
  };
}

/** Read a campaign's brief blob together with the row version it was read at.
 *
 *  Tolerant of a database that never ran campaign_concurrency.sql: no
 *  `updated_at` column simply means no version, and the caller writes
 *  unconditionally as it did before. */
async function readCampaignBlob(id: string): Promise<{ found: boolean; blob: BriefBlob | null; seen?: string }> {
  const db = supabase();
  if (!db) return { found: false, blob: null };
  const { data, error } = await db.from("campaigns").select("data, updated_at").eq("id", id).maybeSingle();
  if (!error) return { found: !!data, blob: (data?.data as BriefBlob) ?? null, seen: (data as { updated_at?: string } | null)?.updated_at };
  const fallback = await db.from("campaigns").select("data").eq("id", id).maybeSingle();
  assertDbOk(fallback.error, "อ่านข้อมูลแคมเปญไม่สำเร็จ");
  return { found: !!fallback.data, blob: (fallback.data?.data as BriefBlob) ?? null };
}

export interface CampaignRowIO {
  /** The row as it is now, with the version it was read at. */
  read(): Promise<{ found: boolean; blob: BriefBlob | null; seen?: string }>;
  /** Write it back; `guard` is the version the write must still match. Returns
   *  the rows it actually changed — empty means the guard did not match. */
  write(payload: Record<string, unknown>, guard?: string): Promise<{ updated_at?: string }[] | null>;
}

/** The retry loop itself, over an injectable row reader/writer so the sequence
 *  it protects can be tested without a database. Returns the written rows, for
 *  the caller to adopt as the version its own write produced. */
export async function patchCampaignRowIO(
  io: CampaignRowIO,
  rowPatch: Record<string, unknown>,
  patch: (blob: BriefBlob) => BriefBlob | null,
  failure: string,
  attempts = 3,
): Promise<{ updated_at?: string }[] | null> {
  const gone = `${failure} — ไม่พบแคมเปญนี้ (อาจถูกลบ หรือคุณไม่มีสิทธิ์แก้)`;
  for (let attempt = 0; attempt < attempts; attempt++) {
    // Re-read every attempt: the patch must be rebuilt on top of whatever the
    // other writer left, never on the copy we first loaded.
    const { found, blob, seen } = await io.read();
    if (!found) throw new Error(gone);
    const nextBlob = blob ? patch(blob) : null;
    // Guard only the blob rewrite. A column-only write has nothing to clobber,
    // and guarding it would fail saves on databases with no version column.
    const written = await io.write(nextBlob ? { ...rowPatch, data: nextBlob } : rowPatch, nextBlob ? seen : undefined);
    if (written?.length) return written;
    // Zero rows with no guard in play means the row is gone or hidden by RLS —
    // retrying that forever would just hide the real reason.
    if (!seen || !nextBlob) throw new Error(gone);
  }
  throw new Error(`${failure} — มีคนแก้แคมเปญนี้อยู่พร้อมกัน ลองใหม่อีกครั้ง`);
}

/** Patch a campaign row AND the brief it carries, in ONE write.
 *
 *  The row's columns (status, budget) and the same facts inside the brief blob
 *  are two copies of one thing, and every writer that moved only the column left
 *  them disagreeing. That is not cosmetic: the Campaign Builder loads the BLOB,
 *  so the next Save writes the blob's stale value back over the column and the
 *  change quietly reverts — an approval or a CMO-approved budget revision undone
 *  by someone else opening Edit. Mother's Day (approved 17 ก.ค. on the row, still
 *  "Waiting for Approval" in its brief and no entry in its approval log) is what
 *  that looks like weeks later.
 *
 *  Compare-and-set, not read-then-write: the blob is rewritten whole, so writing
 *  it back against a row that moved in between would swallow the other person's
 *  edit entirely. If the version moved we re-read and rebuild the patch on top of
 *  what they wrote, and only give up — loudly — if that keeps happening.
 *
 *  `patch` returns the new blob, or null to leave the blob alone (a campaign
 *  created outside the wizard has none; the columns still move). */
async function patchCampaignAndBrief(
  id: string,
  rowPatch: Record<string, unknown>,
  patch: (blob: BriefBlob) => BriefBlob | null,
  failure: string,
): Promise<void> {
  const db = supabase();
  if (!db) return;
  const written = await patchCampaignRowIO({
    read: () => readCampaignBlob(id),
    write: async (payload, guard) => {
      let q = db.from("campaigns").update(payload).eq("id", id);
      if (guard) q = q.eq("updated_at", guard);
      const { data, error } = await q.select("id, updated_at");
      assertDbOk(error, failure);
      return data as { updated_at?: string }[] | null;
    },
  }, rowPatch, patch, failure);
  adoptBriefVersion(id, written);
}

/** Update a campaign's status — on the row AND in the brief it carries.
 *
 *  The UI reaches this only when a campaign has no brief to route through (the
 *  list dropdown and the detail page both save the brief when there is one, so
 *  approving there also materialises the plan). It still patches a blob when it
 *  finds one, because "no brief" here can also mean the read failed a moment
 *  ago — and a status written to the column alone is exactly the drift above.
 *  Materialising an approved plan is not this path's job: a plan that never
 *  became work is recoverable from the campaign's Content tab. */
export async function updateCampaignStatus(id: string, status: string, by = ""): Promise<void> {
  const db = supabase();
  if (!db) return;
  const nextApproval = status === "Waiting Approval" || status === "Waiting for Approval" ? DEFAULT_APPROVER : "None";
  const at = new Date().toISOString();
  await patchCampaignAndBrief(id, { status, next_approval: nextApproval },
    (blob) => briefStatusPatch(blob, status, by, at), "เปลี่ยนสถานะแคมเปญไม่สำเร็จ");
  logAudit(`เปลี่ยนสถานะแคมเปญ ${id}`, "Campaign", { after: status, actorName: by || undefined, meta: { campaignId: id, nextApproval } });
}

/** Delete a campaign and the records Marketing OS generated from its brief so
 * the list, planner modules, and task views stay in sync.
 *
 * With Trash enabled this is a soft delete, and the cascade is soft too — the
 * campaign and everything raised from it go to the bin together, so restoring
 * the campaign brings its posts, briefs and tasks back with it. A cascade that
 * hard-deleted the children would make "กู้คืน" return an empty shell.
 *
 * campaign_results and kols have no deleted_at column (they are derived rows,
 * not things anyone restores on their own), so they still cascade hard. */
export async function deleteCampaign(id: string, by = ""): Promise<void> {
  const db = supabase();
  if (!db) return;

  if (await trashReady()) {
    const stamp = { deleted_at: new Date().toISOString(), deleted_by: by };
    const soft = await Promise.all([
      db.from("content_posts").update(stamp).eq("campaign_id", id).is("deleted_at", null),
      db.from("graphic_requests").update(stamp).eq("campaign_id", id).is("deleted_at", null),
      db.from("tasks").update(stamp).filter("data->>relatedBrief", "eq", id).is("deleted_at", null),
    ]);
    for (const result of soft) assertDbOk(result.error, "Could not move linked campaign records to trash");
    const { error: softError } = await db.from("campaigns").update(stamp).eq("id", id).is("deleted_at", null);
    assertDbOk(softError, "Could not move campaign to trash");
    forgetBriefVersion(id);
    return;
  }

  const results = await Promise.all([
    db.from("content_posts").delete().eq("campaign_id", id),
    db.from("graphic_requests").delete().eq("campaign_id", id),
    db.from("campaign_results").delete().eq("campaign_id", id),
    db.from("tasks").delete().filter("data->>relatedBrief", "eq", id),
    db.from("kols").delete().filter("data->>campaignId", "eq", id),
  ]);
  for (const result of results) assertDbOk(result.error, "Could not delete linked campaign records");

  const { error } = await db.from("campaigns").delete().eq("id", id);
  assertDbOk(error, "Could not delete campaign");
  forgetBriefVersion(id);
}

/** Keep the campaign's ROAS multiple (stored in the legacy `roi` column) in
 *  sync with entered results: ROAS = Σ ad revenue ÷ Σ ad actual spend. Called
 *  after saving result rows so Campaigns / Finance show the real multiple. */
export async function updateCampaignRoas(id: string, roas: number): Promise<void> {
  const rounded = Math.round(roas * 100) / 100;
  const db = supabase();
  if (!db) {
    const c = CAMPAIGNS.find((x) => x.id === id);
    if (c) c.roi = rounded;
    return;
  }
  const { data: written, error } = await db.from("campaigns")
    .update({ roi: rounded }).eq("id", id).select("id, updated_at");
  assertDbOk(error, "Could not update campaign ROAS");
  adoptBriefVersion(id, written as { updated_at?: string }[] | null);
}

/** CMO-approved budget revision. Spend stays untouched; only the campaign plan
 *  cap changes so Finance / Dashboard recalculate from the same source.
 *
 *  The brief's own `budget.total` is the same number and moves with it. Writing
 *  only the column made the revision temporary: the Campaign Builder reads the
 *  brief, so the next Save pushed the pre-revision cap back onto the row and the
 *  approval was gone with nothing to show it ever happened (Seasonal menu: row
 *  ฿6,000, plan still ฿12,000). The revision is recorded in the approval log for
 *  the same reason — a budget that changes with no trace is a governance hole. */
export async function updateCampaignBudget(id: string, budget: number, by = ""): Promise<void> {
  const db = supabase();
  if (!db) {
    const c = CAMPAIGNS.find((x) => x.id === id);
    if (c) c.budget = budget;
    return;
  }
  const at = new Date().toISOString();
  await patchCampaignAndBrief(id, { budget },
    (blob) => briefBudgetPatch(blob, budget, by, at), "ปรับ Budget แคมเปญไม่สำเร็จ");
  logAudit(`ปรับ Budget แคมเปญ ${id}`, "Campaign", { after: String(budget), actorName: by || undefined, meta: { campaignId: id, budget } });
}

/** A single campaign by id — for the detail page. */
export async function fetchCampaign(id: string): Promise<CampaignRow | undefined> {
  const db = supabase();
  if (!db) return CAMPAIGNS.find((c) => c.id === id);
  const { data, error } = await db.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (error || !data) return undefined;
  return toCampaign(data as Row);
}
