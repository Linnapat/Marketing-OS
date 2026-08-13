/* The campaign fan-out against a database that enforces its unique indexes.
 * Run: node --import tsx scripts/test-brief-fanout-race.ts
 *
 * The bug this guards (live, 12 Aug 2026): the campaign detail page has more
 * than one control that ends in saveCampaignBrief — Approve in the header,
 * Approve in the Approval tab, the status dropdown on the campaigns list. Two
 * of them fired seconds apart ran the fan-out CONCURRENTLY: the second run read
 * "which source items already exist" while the first was still inserting, so it
 * re-inserted a post the first run had just written and died on
 *   duplicate key value violates unique constraint "content_posts_source_uniq"
 * — leaving CAM-2026-1303 and CAM-2026-4064 approved with a half-made plan and
 * the CMO looking at a red toast. Postgres skips the failed insert's serial, so
 * the gap in content_posts.id (133) is the fingerprint.
 *
 * Runs against an in-memory stand-in for PostgREST that enforces the same
 * partial unique indexes as supabase/kol_content_integrity.sql — mock mode has
 * no indexes, which is exactly why this shipped unnoticed. */

// Env first: src/lib/supabase reads it at module load, so the imports under
// test are dynamic and happen after the fake transport is installed.
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n    expected ${e}\n         got ${a}`); }
}
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}${detail ? `\n    ${detail}` : ""}`); }
}

// ── a very small PostgREST ──────────────────────────────────────────────────
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const serial: Record<string, number> = {};
/** (table → the source-id column pair that must stay unique per campaign),
 *  mirroring content_posts_source_uniq / graphic_requests_source_uniq. */
const UNIQ: Record<string, string> = {
  content_posts: "sourceContentItemId",
  graphic_requests: "sourceContentItemId",
  kols: "sourceKolRequirementId",
};
/** Every call, in order — the race is a claim about ORDER, so it is recorded. */
const calls: { table: string; verb: string }[] = [];
const rpcCalls: { fn: string; args: Row }[] = [];
/** Set to make the next read of a table fail, the way RLS or a dropped
 *  connection does. */
let failNextSelect: string | null = null;
/** Delay (ms) inserted before each insert, to widen the window a concurrent
 *  fan-out can slip into. */
let insertLag = 0;

function reset() {
  for (const k of Object.keys(db)) delete db[k];
  for (const k of Object.keys(serial)) delete serial[k];
  for (const t of ["campaigns", "content_posts", "graphic_requests", "kols", "tasks", "campaign_types", "org_settings", "members"]) {
    db[t] = []; serial[t] = 0;
  }
  calls.length = 0; rpcCalls.length = 0; failNextSelect = null; insertLag = 0;
}

/** `data->>id` style paths read out of the jsonb blob; anything else is a column. */
function valueOf(row: Row, field: string): unknown {
  const arrow = field.split("->>");
  if (arrow.length === 2) {
    const blob = row[arrow[0].trim()] as Row | null;
    const v = blob ? blob[arrow[1].trim()] : undefined;
    return v === undefined || v === null ? null : String(v);
  }
  return row[field] ?? null;
}

function applyFilters(rows: Row[], params: URLSearchParams): Row[] {
  let out = rows;
  for (const [key, raw] of params.entries()) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    const val = rest.join(".");
    if (op === "eq") out = out.filter((r) => String(valueOf(r, key) ?? "") === val);
    else if (op === "is") out = out.filter((r) => (val === "null" ? valueOf(r, key) === null : valueOf(r, key) === (val === "true")));
    else throw new Error(`fake PostgREST: unsupported operator ${op}`);
  }
  return out;
}

function uniqueClash(table: string, row: Row): boolean {
  const field = UNIQ[table];
  if (!field) return false;
  const key = valueOf(row, `data->>${field}`);
  if (key === null || key === "") return false;                 // partial index
  return (db[table] ?? []).some((r) =>
    r.campaign_id === row.campaign_id && valueOf(r, `data->>${field}`) === key);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers as HeadersInit);
  const wantsObject = (headers.get("Accept") ?? "").includes("vnd.pgrst.object");
  const prefer = headers.get("Prefer") ?? "";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;

  const rpc = url.pathname.match(/\/rest\/v1\/rpc\/(.+)$/);
  if (rpc) { rpcCalls.push({ fn: rpc[1], args: body as Row }); return json(null); }

  const table = url.pathname.replace("/rest/v1/", "");
  db[table] ??= []; serial[table] ??= 0;
  calls.push({ table, verb: method });

  if (method === "GET") {
    if (failNextSelect === table) { failNextSelect = null; return json({ message: "permission denied", code: "42501" }, 403); }
    let rows = applyFilters(db[table], url.searchParams);
    const limit = url.searchParams.get("limit");
    if (limit) rows = rows.slice(0, Number(limit));
    if (wantsObject) {
      if (rows.length !== 1) return json({ code: "PGRST116", message: "no (or more than one) rows" }, 406);
      return json(rows[0]);
    }
    return json(rows);
  }

  if (method === "POST") {
    if (insertLag) await new Promise((r) => setTimeout(r, insertLag));
    const incoming: Row[] = Array.isArray(body) ? body : [body as Row];
    const written: Row[] = [];
    for (const raw of incoming) {
      const merge = prefer.includes("merge-duplicates");
      const hit = merge && raw.id !== undefined ? db[table].find((r) => r.id === raw.id) : undefined;
      if (hit) { Object.assign(hit, raw, { updated_at: new Date().toISOString() }); written.push(hit); continue; }
      if (uniqueClash(table, raw)) {
        // Postgres burns the serial on a failed insert — the gap live data shows.
        serial[table]++;
        return json({
          code: "23505",
          message: `duplicate key value violates unique constraint "${table}_source_uniq"`,
        }, 409);
      }
      const row: Row = { ...raw, updated_at: new Date().toISOString() };
      if (row.id === undefined) row.id = ++serial[table];
      db[table].push(row);
      written.push(row);
    }
    if (!prefer.includes("return=representation")) return json(null, 201);
    return wantsObject
      ? (written.length === 1 ? json(written[0]) : json({ code: "PGRST116", message: "not one row" }, 406))
      : json(written);
  }

  if (method === "PATCH") {
    const rows = applyFilters(db[table], url.searchParams);
    for (const r of rows) Object.assign(r, body as Row, { updated_at: new Date().toISOString() });
    return prefer.includes("return=representation") ? json(rows) : json(null, 204);
  }

  if (method === "DELETE") {
    const rows = applyFilters(db[table], url.searchParams);
    db[table] = db[table].filter((r) => !rows.includes(r));
    return prefer.includes("return=representation") ? json(rows) : json(null, 204);
  }
  throw new Error(`fake PostgREST: unsupported method ${method}`);
}) as typeof fetch;

reset();

// supabase-js builds a realtime client eagerly and Node 20 has no global
// WebSocket. Nothing here subscribes to anything; this only has to exist.
(globalThis as { WebSocket?: unknown }).WebSocket ??= class { close() {} } as unknown;

// Type-only, so nothing is imported before the transport above is in place.
type Brief = Parameters<typeof import("../src/lib/db/brief").saveCampaignBrief>[0];

const CID = "CAM-2026-1303";
function brief(items = 3): Brief {
  return {
    id: CID, code: "TPN-2026-013", name: "Brand Awareness", b: "teppen", branch: "All",
    objective: "Awareness", campaignType: "Always-on", audience: "—", mainMessage: "—", offer: "",
    kvDirection: "", startDate: "2026-09-01", endDate: "2026-09-30",
    plannerOwner: "Pichayaporn", approver: "Gik", status: "Approved",
    channels: ["Instagram"], successMetrics: [], approvalLog: [], kols: [],
    budget: { total: 0, ads: 0, kol: 0, production: 0, crm: 0, other: 0, adsByPlatform: [] },
    content: Array.from({ length: items }, (_, i) => ({
      id: `ci-${i + 1}`, title: `Post ${i + 1}`, type: "Single Post", platforms: ["Instagram"],
      publishDate: "2026-09-05", status: "Draft", priority: "Med", assets: [],
      requiredGraphic: true, requiredVideo: false, requester: "Pichayaporn",
      designer: "Unassigned", approver: "Pichayaporn", cta: "", driveLink: "https://drive.example/kv",
    })),
  } as unknown as Brief;
}
function seedCampaign() {
  db.campaigns.push({ id: CID, name: "Brand Awareness", brand: "teppen", data: { code: "TPN-2026-013" }, updated_at: new Date().toISOString() });
}
const postsOf = (cid = CID) => db.content_posts.filter((r) => r.campaign_id === cid);
const sourcesOf = (cid = CID) => postsOf(cid).map((r) => (r.data as Row).sourceContentItemId).sort();

// tsx compiles these to CJS, where top-level await is unavailable.
async function main() {
const { saveCampaignBrief } = await import("../src/lib/db/brief");
const { createContentIfNew, fetchContentSourceIds } = await import("../src/lib/db/content");
const { createGraphicIfNew } = await import("../src/lib/db/graphic");
const { forgetBriefVersion } = await import("../src/lib/db/briefVersion");
const { resetTrashProbe } = await import("../src/lib/db/trash");

console.log("\ntwo Approve clicks at once — the live failure");
{
  reset(); seedCampaign(); forgetBriefVersion(CID); resetTrashProbe();
  insertLag = 4;                                   // widen the window they raced in
  const results = await Promise.allSettled([saveCampaignBrief(brief()), saveCampaignBrief(brief())]);
  const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  ok("neither click errors", rejected.length === 0, rejected.map((r) => String(r.reason?.message ?? r.reason)).join(" · "));
  is("one post per content item, not two", sourcesOf(), ["ci-1", "ci-2", "ci-3"]);
  is("one graphic request per content item", db.graphic_requests.length, 3);
  const created = results.map((r) => (r.status === "fulfilled" ? r.value.created.content : -1));
  is("only the run that made them counts them", created.sort(), [0, 3]);
}

console.log("\nthe same two clicks, arriving mid-insert rather than at the start");
{
  reset(); seedCampaign(); forgetBriefVersion(CID); resetTrashProbe();
  insertLag = 4;
  const first = saveCampaignBrief(brief(4));
  await new Promise((r) => setTimeout(r, 12));     // second click lands mid fan-out
  const second = saveCampaignBrief(brief(4));
  const results = await Promise.allSettled([first, second]);
  const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  ok("still no duplicate-key error", rejected.length === 0, rejected.map((r) => String(r.reason?.message ?? r.reason)).join(" · "));
  is("four items, four posts", sourcesOf(), ["ci-1", "ci-2", "ci-3", "ci-4"]);
}

console.log("\nre-approving an already-materialised campaign");
{
  reset(); seedCampaign(); forgetBriefVersion(CID); resetTrashProbe();
  await saveCampaignBrief(brief());
  const before = db.content_posts.length;
  rpcCalls.length = 0;
  const again = await saveCampaignBrief(brief());
  is("creates nothing the second time", again.created, { content: 0, graphics: 0, kols: 0, tasks: 0 });
  is("no extra rows", db.content_posts.length, before);
  // The top-up aims at the request that EXISTS. It used to be handed the fresh
  // gid this run had just minted, which matches no row — every re-approve logged
  // "ไม่พบใบงานนี้" and the Drive link never reached the blank request.
  const patched = rpcCalls.filter((c) => c.fn === "graphic_brief_patch").map((c) => String(c.args.p_id)).sort();
  const live = db.graphic_requests.map((r) => String((r.data as Row).id)).sort();
  is("brief top-up targets the live request ids", patched, live);
}

console.log("\na row that appeared between the read and the insert");
{
  reset(); seedCampaign(); forgetBriefVersion(CID); resetTrashProbe();
  await saveCampaignBrief(brief(1));
  const existingPost = postsOf()[0].data as Row;
  const existingGraphic = db.graphic_requests[0].data as Row;
  // A stale idempotency set — precisely what a concurrent run holds.
  const stale = new Set<string>();
  const madeContent = await createContentIfNew({ ...existingPost, id: "c-late" } as never, stale);
  is("the post is reported as already there, not thrown", madeContent.created, false);
  is("and no duplicate was written", postsOf().length, 1);
  const madeGraphic = await createGraphicIfNew({ ...existingGraphic, id: 999999 } as never, new Map());
  is("same for the graphic request", madeGraphic.created, false);
  is("which names the row that already serves the item", String(madeGraphic.existingId), String(existingGraphic.id));
  is("still one request", db.graphic_requests.length, 1);
}

console.log("\nwhen the idempotency read itself fails");
{
  reset(); seedCampaign(); forgetBriefVersion(CID); resetTrashProbe();
  await saveCampaignBrief(brief(2));
  const before = db.content_posts.length;
  failNextSelect = "content_posts";
  let threw = "";
  await fetchContentSourceIds(CID).catch((e) => { threw = String(e.message); });
  ok("a failed read is an error, not an empty set", threw.includes("เช็คงานเดิมของแคมเปญไม่สำเร็จ"), threw);
  is("nothing was written on the strength of it", db.content_posts.length, before);
}
}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}).catch((e) => { console.error(e); process.exit(1); });
