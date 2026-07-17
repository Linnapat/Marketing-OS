/* Runtime tests for the artwork count an outsource invoice is checked against.
 * Every assertion here is a baht: over-count and we overpay, under-count and a
 * studio works for free, wrong month and it lands on the wrong invoice.
 * Policy (agreed 2026-07): resize = a new piece; same size on two platforms =
 * one piece; approved-only; revisions never pay twice; month = approval date.
 * Run with:  npm test   (chained after test-agency-deliverables.ts)
 * Same self-contained assert harness as the other suites — no runner needed. */

import { artworkReport, artworkTotals, artworkMonths, creativeWorkload, revisionRate } from "../src/lib/data/artworkReport";
import { Graphic, GraphicDeliverable, GraphicEvent } from "../src/lib/data/graphic";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  check(name, actual === expected);
}

const del = (platform: string, size: string, status = "Approved"): GraphicDeliverable => ({
  platform, size, refLink: "", assetLink: "https://drive/x", sourceLink: "", status,
  version: 1, submittedBy: "GID", submittedAt: "", feedback: [],
});
const approved = (platform: string, size: string, at: string): GraphicEvent =>
  ({ type: "approved", at, by: "Ken S.", deliverableKey: `${platform}::${size}` });
const sentBack = (platform: string, size: string, at: string): GraphicEvent =>
  ({ type: "revision_requested", at, by: "Ken S.", deliverableKey: `${platform}::${size}`, note: "แก้โลโก้" });

const req = (over: Partial<Graphic> = {}): Graphic => ({
  id: 1, stage: "Approved", title: "Lunch carousel", b: "mainichi", campaign: "Rainy Season Promo",
  due: "Aug 5", designer: "GID", requester: "Nok W.", approver: "Ken S.", type: "Social Media",
  priority: "Med", fb: 0, openFb: 0, isOverdue: false, briefComplete: true, pendingApprover: "—",
  blocker: null, waitingSince: "", nextAction: "", platform: "IG", size: "—", contentItem: "—",
  deliverables: [], history: [], ...over,
});

console.log("\n— resize = a new piece —");
{
  const g = req({
    deliverables: [del("Instagram", "1:1"), del("Instagram", "4:5"), del("Instagram", "9:16")],
    history: [approved("Instagram", "1:1", "2026-08-03T10:00:00Z"), approved("Instagram", "4:5", "2026-08-03T10:00:00Z"), approved("Instagram", "9:16", "2026-08-04T09:00:00Z")],
  });
  const { pieces } = artworkReport([g]);
  is("three sizes = three billable pieces", pieces.length, 3);
  is("…all credited to the studio", new Set(pieces.map((p) => p.designer)).size, 1);
  is("…and to the studio named on the request", pieces[0].designer, "GID");
}
{
  // One file, two placements. Paying twice here would be an overcharge.
  const g = req({
    deliverables: [del("Facebook", "1:1"), del("Instagram", "1:1")],
    history: [approved("Facebook", "1:1", "2026-08-03T10:00:00Z"), approved("Instagram", "1:1", "2026-08-03T11:00:00Z")],
  });
  const { pieces } = artworkReport([g]);
  is("same size on two platforms = ONE piece", pieces.length, 1);
  is("…and it records both placements", pieces[0].platforms.join("+"), "Facebook+Instagram");
  is("…dated at the first approval", pieces[0].approvedAt, "2026-08-03T10:00:00Z");
}

console.log("\n— only approved work is billable —");
{
  const g = req({
    stage: "Waiting Feedback",
    deliverables: [del("Instagram", "1:1", "Approved"), del("Instagram", "4:5", "Waiting review"), del("Instagram", "9:16", "Not submitted")],
    history: [approved("Instagram", "1:1", "2026-08-03T10:00:00Z")],
  });
  const { pieces } = artworkReport([g]);
  is("submitted-but-unapproved does not count", pieces.length, 1);
  is("…the approved one does", pieces[0].size, "1:1");
}
{
  const g = req({
    stage: "Revision Requested",
    deliverables: [del("Instagram", "1:1", "Revision")],
    history: [sentBack("Instagram", "1:1", "2026-08-02T10:00:00Z")],
  });
  is("a piece sent back and not yet accepted pays nothing", artworkReport([g]).pieces.length, 0);
}
{
  // Sent back twice, then accepted: still ONE piece — fixing it is not new work.
  const g = req({
    deliverables: [del("Instagram", "1:1")],
    history: [
      sentBack("Instagram", "1:1", "2026-08-01T10:00:00Z"),
      sentBack("Instagram", "1:1", "2026-08-02T10:00:00Z"),
      approved("Instagram", "1:1", "2026-08-05T10:00:00Z"),
    ],
  });
  const { pieces } = artworkReport([g]);
  is("two revisions then approval = one piece", pieces.length, 1);
  is("…revisions are reported, not billed", pieces[0].revisions, 2);
}

console.log("\n— the month is the approval month, never the due date —");
{
  const g = req({
    due: "Jul 28", // requested in July…
    deliverables: [del("Instagram", "1:1")],
    history: [approved("Instagram", "1:1", "2026-08-02T09:00:00Z")], // …accepted in August
    history_note: undefined,
  } as Partial<Graphic>);
  const { pieces } = artworkReport([g]);
  is("a July request accepted in August bills to August", pieces[0].month, "2026-08");
}
{
  // Approved with no timestamp anywhere: real work, but undateable. It must not
  // be dropped (studio loses money) nor guessed into a month (wrong invoice).
  const g = req({ deliverables: [del("Instagram", "1:1")], history: [] });
  const { pieces, undated } = artworkReport([g]);
  is("undateable work is not filed into a month", pieces.length, 0);
  is("…but is surfaced separately", undated.length, 1);
  is("…with an empty month", undated[0].month, "");
}

console.log("\n— totals for an invoice —");
{
  const graphics = [
    req({ id: 1, designer: "GID", type: "Social Media",
      deliverables: [del("Instagram", "1:1"), del("Instagram", "4:5")],
      history: [approved("Instagram", "1:1", "2026-08-03T10:00:00Z"), approved("Instagram", "4:5", "2026-08-03T10:00:00Z")] }),
    req({ id: 2, designer: "GID", type: "Reel", // a different rate — must not merge
      deliverables: [del("TikTok", "9:16")],
      history: [approved("TikTok", "9:16", "2026-08-10T10:00:00Z")] }),
    req({ id: 3, designer: "Boss", type: "Social Media", // in-house, same month
      deliverables: [del("Facebook", "16:9")],
      history: [approved("Facebook", "16:9", "2026-08-11T10:00:00Z")] }),
    req({ id: 4, designer: "GID", type: "Social Media", // previous month
      deliverables: [del("Instagram", "1:1")],
      history: [approved("Instagram", "1:1", "2026-07-20T10:00:00Z")] }),
  ];
  const { pieces } = artworkReport(graphics);
  is("months are listed newest first", artworkMonths(pieces).join(","), "2026-08,2026-07");

  const august = pieces.filter((p) => p.month === "2026-08");
  const totals = artworkTotals(august);
  const gidGraphic = totals.find((t) => t.designer === "GID" && t.kind === "graphic");
  const gidVideo = totals.find((t) => t.designer === "GID" && t.kind === "vdo");
  is("GID's August graphic pieces", gidGraphic?.pieces, 2);
  is("…from one request", gidGraphic?.requests, 1);
  is("video is counted apart (different rate)", gidVideo?.pieces, 1);
  is("in-house work is a separate line, not GID's", totals.find((t) => t.designer === "Boss")?.pieces, 1);
  is("July does not leak into August", august.filter((p) => p.designer === "GID").length, 3);
  is("…July has its own piece", pieces.filter((p) => p.month === "2026-07").length, 1);
}

console.log("\n— video work counts as pieces —");
{
  // A "Photo" request flagged requiredVideo (the content item ticked Needs
  // Video): the type string alone reads as graphic — the flag must win, or
  // video work lands on the wrong invoice line (the rates differ).
  const flagged = req({
    id: 60, type: "Photo", requiredVideo: true,
    deliverables: [del("Instagram", "1:1")],
    history: [approved("Instagram", "1:1", "2026-08-05T10:00:00Z")],
  });
  const { pieces } = artworkReport([flagged]);
  is("requiredVideo forces the vdo kind", pieces[0]?.kind, "vdo");

  const plain = req({
    id: 61, type: "Photo",
    deliverables: [del("Instagram", "1:1")],
    history: [approved("Instagram", "1:1", "2026-08-05T10:00:00Z")],
  });
  is("…without the flag, Photo stays graphic", artworkReport([plain]).pieces[0]?.kind, "graphic");
}

console.log("\n— current workload (who carries what right now) —");
{
  const graphics = [
    req({ id: 70, designer: "GID", type: "Photo", dueIso: "2026-09-02", deliverables: [del("Instagram", "1:1", "Not submitted")] }),
    req({ id: 71, designer: "GID", type: "Reel", requiredVideo: true, dueIso: "2026-08-30", deliverables: [del("TikTok", "9:16", "Waiting review")] }),
    req({ id: 72, designer: "GID", type: "Photo", dueIso: "2026-09-10", deliverables: [del("Facebook", "4:5", "Revision")] }),
    req({ id: 73, designer: "Boss", type: "VDO Shooting", dueIso: "2026-09-03", deliverables: [del("Asset", "—", "Not submitted")] }),
    // Approved work must NOT appear in the workload at all.
    req({ id: 74, designer: "Boss", type: "Photo", deliverables: [del("Instagram", "1:1")] }),
  ];
  const rows = creativeWorkload(graphics, "2026-09-01");
  const gid = rows.find((r) => r.designer === "GID")!;
  is("open requests are bucketed by stage — in progress", gid.inProgress, 1);
  is("…waiting review sits with the approver", gid.waitingReview, 1);
  is("…revision is active fixing work", gid.revision, 1);
  is("a due date before today is late", gid.overdue, 1);
  is("due within 3 days is flagged, not late", gid.dueSoon, 1);
  is("the mix names the kinds in the team's words", gid.mix.vdo, 1);
  const boss = rows.find((r) => r.designer === "Boss")!;
  is("a shoot day counts in the shoot kind", boss.mix.vdo_shoot, 1);
  is("approved work is not workload", rows.reduce((s, r) => s + r.inProgress + r.waitingReview + r.revision, 0), 4);
  is("busiest designer sorts first", rows[0].designer, "GID");

  // Revision rate is piece-based: one piece bounced five times is one bad
  // piece, not five — otherwise a single difficult job poisons the rate.
  const pieces = [
    { revisions: 5 }, { revisions: 0 }, { revisions: 1 }, { revisions: 0 },
  ] as Parameters<typeof revisionRate>[0];
  is("revision rate counts pieces, not bounces", revisionRate(pieces), 0.5);
  is("empty month has rate 0", revisionRate([]), 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
