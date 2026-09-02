// Persist a Campaign Brief and fan it out into the rest of Marketing OS:
// real content posts, graphic requests (for every content item that needs a
// graphic), KOL requests, and tasks (content / KOL / ads / CRM / report) — all
// linked back to the campaign. Finance is deliberately left untouched: budget
// allocation lives on the brief only.

import { supabase } from "@/lib/supabase";
import { CampaignBrief, ApprovalLogEntry, BriefContentItem, BriefKolItem, budgetSummary, fmtRange, contentBriefLink } from "@/lib/data/brief";
import { CampaignRow } from "@/lib/data/campaigns";
import { createCampaign, fetchCampaigns } from "./campaigns";
import { createContentIfNew, fetchContentSourceIds, fetchCampaignPosts, adoptPostForBriefItem } from "./content";
import { adoptablePostFor } from "@/lib/data/fanoutAdopt";
import { createGraphicIfNew, fetchGraphicSourceIds, fetchGraphicIdForPost, adoptGraphicForBriefItem, buildGraphic, topUpGraphicBrief } from "./graphic";
import { needsStoryboard, initialNextAction } from "@/lib/data/graphic";
import { autoNumberDeliverables, emptyDeliverable } from "@/lib/data/graphic";
import { upsertKolRequirement, fetchKolsForCampaign, buildKol } from "./kol";
import { Kol } from "@/lib/data/kol";
import { resolveKolAssignment, resolveCaptionWriter } from "./assignments";
import { upsertBriefTask } from "./tasks";
import { ContentItem } from "@/lib/data/content";
import { Graphic } from "@/lib/data/graphic";
import { Task } from "@/lib/data/tasks";
import { brandName } from "@/lib/brands";
import { assertDbOk } from "@/lib/db/assert";
import { DEFAULT_APPROVER } from "@/lib/approval";
import { logAudit } from "@/lib/db/audit";
import { noteBriefVersion, forgetBriefVersion, briefVersionOf, adoptBriefVersion } from "./briefVersion";

// Re-exported from here because this is where callers already reach for brief
// persistence; the map itself lives in ./briefVersion so db/campaigns can keep
// it current too, without importing this module back.
export { noteBriefVersion, forgetBriefVersion } from "./briefVersion";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface BriefSaveResult {
  campaign: CampaignRow;
  created: { content: number; graphics: number; kols: number; tasks: number };
}

// One fan-out per campaign at a time, chained not joined: the detail page has
// more than one control that ends in saveCampaignBrief (Approve on the header,
// Approve on the Approval tab, the campaigns-list status dropdown), and two of
// them fired within seconds have raced each other in production — the second
// run's idempotency read happened mid-flight through the first run's inserts,
// so it re-inserted a post the first run had just written and died on
// content_posts_source_uniq. Queueing the second run behind the first keeps
// every read after every prior write; each caller still writes its own brief.
const briefSaveQueue = new Map<string, Promise<unknown>>();

/** The row types this expands into (kept in one place for the preview + save). */
export async function saveCampaignBrief(brief: CampaignBrief): Promise<BriefSaveResult> {
  const prior = briefSaveQueue.get(brief.id) ?? Promise.resolve();
  const run = prior.catch(() => {}).then(() => doSaveCampaignBrief(brief));
  briefSaveQueue.set(brief.id, run);
  try {
    return await run;
  } finally {
    if (briefSaveQueue.get(brief.id) === run) briefSaveQueue.delete(brief.id);
  }
}

async function doSaveCampaignBrief(brief: CampaignBrief): Promise<BriefSaveResult> {
  const normalizedBrief: CampaignBrief = {
    ...brief,
    content: brief.content.map((ci) => {
      const requester = ci.requester?.trim() || brief.plannerOwner || "You";
      return {
        ...ci,
        requester,
        designer: ci.designer || "Unassigned",
        approver: ci.approver?.trim() || requester,
      };
    }),
  };
  const bn = brandName(brief.b);
  const stamp = Date.now();

  const row: CampaignRow = {
    id: normalizedBrief.id, name: normalizedBrief.name, b: normalizedBrief.b, branch: normalizedBrief.branch,
    // spend seeds Finance "Committed" — the amount allocated across buckets at plan time.
    owner: normalizedBrief.plannerOwner || "Unassigned", budget: normalizedBrief.budget.total, spend: budgetSummary(normalizedBrief).allocated, roi: 0,
    // The flight goes to the columns as dates and to `dates` as the label the
    // team reads. Same two values, so the label can never drift from the data.
    startDate: normalizedBrief.startDate || undefined, endDate: normalizedBrief.endDate || undefined,
    dates: fmtRange(normalizedBrief.startDate, normalizedBrief.endDate), status: normalizedBrief.status,
    campType: normalizedBrief.campaignType || normalizedBrief.objective, readiness: "needs_attention",
    taskBlocked: 0, taskWaiting: 0, taskOverdue: 0, taskTotal: 0, taskDone: 0, taskInProgress: 0,
    bottleneckTeam: "None", nextApproval: normalizedBrief.status === "Waiting for Approval" ? (normalizedBrief.approver || DEFAULT_APPROVER) : "None",
  };
  await createCampaign(row);
  await persistBriefBlob(normalizedBrief);

  // Idempotency: what's already been materialised for this campaign, so a repeat
  // Submit / retry creates nothing new. Keyed by real source ids, not names.
  // The campaign's posts come first because both of the other reads depend on
  // them: a post raised by hand is how a request that predates the brief gets
  // recognised at all.
  const campaignPosts = await fetchCampaignPosts(normalizedBrief.id);
  const [contentSeen, graphicSeen, kolRows, kolAssign] = await Promise.all([
    fetchContentSourceIds(normalizedBrief.id),
    fetchGraphicSourceIds(normalizedBrief.id, campaignPosts),
    fetchKolsForCampaign(normalizedBrief.id),
    resolveKolAssignment(),
  ]);

  let content = 0, graphics = 0, kols = 0, tasks = 0;

  const mkTask = (n: number, opts: Omit<Partial<Task>, "priority"> & { title: string; type: string; owner: string; priority?: string }): Task => ({
    id: stamp + n, title: opts.title, module: opts.type, moduleIcon: opts.moduleIcon ?? "📋",
    moduleColor: opts.moduleColor ?? "#6b6258", type: opts.type, assignee: opts.owner || "Unassigned",
    brand: bn, campaign: brief.name, status: "Todo", priority: ((opts.priority as Task["priority"]) || "Med"),
    group: "quickWins", due: opts.due ?? "TBD", blocker: null, pendingApprover: null, isQuickWin: false,
    nextAction: opts.nextAction ?? "Start when ready.", checklist: [], channel: opts.channel,
    relatedBrief: brief.id, relatedGraphicId: opts.relatedGraphicId, dueIso: opts.dueIso,
  });

  // ── CMO-approval gate ──────────────────────────────────────────────────────
  // Nothing flows downstream until the CMO approves the campaign. A Draft or
  // "Waiting for Approval" brief only saves its plan; content posts, graphic
  // requests, KOL rows and tasks are materialised the moment it turns
  // "Approved" (or later), so the Content Calendar / Graphic Request never
  // show work from an unapproved campaign.
  const materialize = ["Approved", "In Progress", "Completed"].includes(normalizedBrief.status);
  if (!materialize) {
    return { campaign: row, created: { content: 0, graphics: 0, kols: 0, tasks: 0 } };
  }

  // ── Content items → content posts + graphic requests + content/graphic tasks ─
  // Each row carries campaignId + sourceContentItemId; createXIfNew skips when
  // the pair already exists, so re-Submit is a no-op (no duplicates, no dupe tasks).
  let n = 0;
  // Content items need their OWN index. `n` is the task sequence and only
  // advances when a task is actually created — so on a re-submit, where the
  // posts and graphics already exist and no tasks are made, it stayed put and
  // the next content item reused the previous one's post id AND graphic id.
  // Found live: two posts (from ci-1 and ci-6 of one campaign) sharing
  // "c17853298244150" and graphic "1785329824915". Sharing a post id means
  // updateContent/deleteContent match BOTH rows, so editing one edited the
  // other and deleting one deleted the other.
  let itemIndex = 0;
  // Resolved once for the whole fan-out — a campaign with twelve content items
  // does not need twelve member lookups for one answer.
  const captionWriter = await resolveCaptionWriter();
  for (const ci of normalizedBrief.content) {
    const idx = itemIndex++;
    const plats = ci.platforms.length ? ci.platforms : ["Instagram"];
    // Video work needs a Creative request just like graphic work — a content
    // item with only "Needs Video" used to become a bare task, so VDO pieces
    // never reached Graphic Request and were never counted in Artwork Count.
    const needsCreative = ci.requiredGraphic || ci.requiredVideo;
    // stamp*1000 rather than stamp+500: two campaigns submitted a few
    // milliseconds apart could otherwise land on the same number
    // (stamp+500+i === stamp'+500+j whenever stamp-stamp' === j-i).
    const gid = needsCreative ? stamp * 1000 + idx : undefined;
    const post: ContentItem = {
      // No publish date yet → fall back to the campaign Start Date (stays inside the
      // campaign window) rather than day 1 of the month.
      // Separator so the stamp and the index can never run together into an id
      // another (stamp, index) pair could also spell.
      id: `c${stamp}-${idx}`, day: dayOf(ci.publishDate) || dayOf(normalizedBrief.startDate) || 1,
      dateIso: ci.publishDate || normalizedBrief.startDate || undefined, time: "10:00", title: ci.title || `${normalizedBrief.name} — Content ${n + 1}`,
      b: normalizedBrief.b, plat: plats[0], platforms: plats, status: ci.status || "Draft", campaign: normalizedBrief.name,
      campaignId: normalizedBrief.id, sourceContentItemId: ci.id, graphicRequestId: gid ? String(gid) : undefined,
      requester: ci.requester, designer: ci.designer, approver: ci.approver,
      // The caption WRITER, and captions are Creative's work: the marketer asks
      // for the post and accepts the words, Creative writes them.
      //
      // This read `ci.requester` — the person who ASKED. That made writer,
      // requester and approver the same name on 49 live posts, so the rule that
      // nobody signs off their own words barred the one person the row named,
      // and a row naming a reviewer offers the buttons to no one else: the
      // Caption lane read "ทั้งทีม 42" with every button dead. The Creative
      // Leader is the landing point and hands it on from there.
      owner: captionWriter, caption: "", hashtags: "", cta: ci.cta || "",
      // Brief guide for the caption writer.
      subHead: ci.subHead || undefined, mainMessage: ci.mainMessage || undefined,
      productHighlight: ci.productHighlight || undefined, captionDirection: ci.captionDirection || undefined,
      driveLink: contentBriefLink(ci) || undefined,
      mandatoryText: ci.mandatoryText || undefined, doDont: ci.doDont || undefined,
      captionStatus: "Missing", assetStatus: needsCreative ? "Waiting Design" : "No Asset",
      approvalStatus: "Draft", publishStatus: "Draft",
    };
    // Was this piece already briefed by hand, before it was written into the
    // campaign? Then take that post over instead of making a second one — and
    // stamp the item onto it, so every later run matches by id and none of this
    // has to be inferred again. Everything else about the post is left alone:
    // whatever the team has done to it since is theirs, not the brief's to
    // overwrite.
    const adopted = contentSeen.has(ci.id) ? null : adoptablePostFor(ci, campaignPosts);
    if (adopted) {
      await adoptPostForBriefItem(adopted.id, ci.id);
      adopted.sourceContentItemId = ci.id;
      contentSeen.add(ci.id);
      // The request linked to that post answers this item too — without this
      // the graphic half would still be made twice. Stamped as well as
      // remembered, so the next run matches by id instead of inferring it
      // again.
      const linked = await fetchGraphicIdForPost(adopted.id);
      if (linked !== undefined && !graphicSeen.has(ci.id)) {
        graphicSeen.set(ci.id, linked);
        await adoptGraphicForBriefItem(linked, ci.id);
      }
    }
    const madeContent = await createContentIfNew(post, contentSeen);
    if (madeContent.created) {
      content++;
      // A content item with creative produces one Graphic work item only. The
      // Content Calendar post remains linked, but does not duplicate My Tasks.
      if (!needsCreative) {
        const madeTask = await upsertBriefTask(mkTask(++n, {
          title: `${ci.title || "Content"} — ${ci.type}`, type: "Content", moduleIcon: "📝", moduleColor: "#3E5C9A",
          // The requester asked for this item, so it is theirs until handed on.
          owner: ci.requester, priority: ci.priority, due: labelDate(ci.publishDate), dueIso: ci.publishDate,
          nextAction: `${plats.join(", ")} · publish ${labelDate(ci.publishDate) || "TBD"}`,
        }), `${brief.id}:content:${ci.id}`);
        if (madeTask.created) tasks++;
      }
    }

    if (needsCreative && gid) {
      // ONE graphic request per content item, carrying a deliverable per
      // Platform × Asset Size the content needs. The requester (Planner) approves.
      const pairs = ci.assets.length ? ci.assets : plats.map((p) => ({ platform: p, size: "" }));
      // Artwork numbers are assigned HERE, from the sizes the planner picked —
      // same size across platforms = one artwork; no hand-numbering later.
      const deliverables = autoNumberDeliverables(pairs.map((a) => emptyDeliverable(a.platform, a.size || "—", contentBriefLink(ci))));
      const g: Graphic = {
        ...buildGraphic({
          id: gid, b: brief.b, campaign: brief.name, title: `${ci.title || "Content"} — ${ci.type}`,
          type: ci.type, due: labelDate(ci.graphicDueDate || ci.publishDate) || "TBD", dueIso: ci.graphicDueDate || ci.publishDate, designer: "Unassigned",
          requester: ci.requester, approver: ci.approver, channels: plats,
          campaignId: normalizedBrief.id, sourceContentItemId: ci.id,
        }),
        stage: "New Request",
        size: pairs.map((a) => a.size).filter(Boolean).join(" · ") || "—",
        requiredVideo: ci.requiredVideo || undefined,
        deliverables,
        // Real creative brief content carried from the content item, so the
        // Graphic drawer shows the actual message/mood/links — not workflow text.
        keyMessage: ci.mainMessage || normalizedBrief.mainMessage || "",
        moodDirection: normalizedBrief.kvDirection || ci.captionDirection || "",
        captionCopy: ci.captionDirection || "",
        extraDetails: ci.doDont || ci.mandatoryText || "",
        // One link on the request, from the one box the form now offers —
        // contentBriefLink still reads the three retired ones for older items.
        briefLink: contentBriefLink(ci),
        // Video items start at the storyboard, exactly as they do when raised
        // by hand — otherwise a Reel materialised from an approved campaign
        // would skip straight to artwork and lose the step.
        storyboardStatus: needsStoryboard({ type: ci.type, requiredVideo: ci.requiredVideo }) ? "Waiting" as const : undefined,
        // What to DO, not what to read — the brief content is two fields up and
        // the Brief tab prints it. See initialNextAction.
        nextAction: initialNextAction({ type: ci.type, requiredVideo: ci.requiredVideo, designer: "Unassigned" }),
        contentItem: ci.title || "—",
      };
      const madeGraphic = await createGraphicIfNew(g, graphicSeen);
      // Already there: push the brief detail down instead of skipping the row
      // entirely, which is how a request ended up blank while its campaign
      // carried the link. Blanks only, never on an accepted request. Aimed at
      // the request that exists — `gid` is this run's fresh number, which on a
      // re-run names no row (every top-up landed on "ไม่พบใบงานนี้" until now).
      if (!madeGraphic.created) {
        await topUpGraphicBrief(madeGraphic.existingId ?? gid, {
          briefLink: g.briefLink, objective: g.objective, keyMessage: g.keyMessage,
          moodDirection: g.moodDirection, captionCopy: g.captionCopy, extraDetails: g.extraDetails,
        });
      }
      if (madeGraphic.created) {
        graphics++;
        const madeTask = await upsertBriefTask(mkTask(++n, {
          title: `Graphic — ${ci.title || ci.type} (${deliverables.length} asset)`, type: "Graphic", moduleIcon: "🎨", moduleColor: "#C68A1E",
          // Left unowned on purpose when no designer is set: Creative Leader
          // assigns after the brief lands, and the assignment queue is where it
          // waits. Parking it on the requester would hide it from that queue.
          owner: ci.designer && ci.designer !== "Unassigned" ? ci.designer : "", priority: ci.priority, due: labelDate(ci.graphicDueDate || ci.publishDate), dueIso: ci.graphicDueDate || ci.publishDate,
          channel: plats.join(", "), relatedGraphicId: String(gid), nextAction: `Deliver ${deliverables.length} asset(s)`,
        }), `${brief.id}:graphic:${ci.id}`);
        if (madeTask.created) tasks++;
      }
    }
  }

  // ── KOL requirements → KOL requests + KOL tasks ────────────────────────────
  // A requirement of N pages fans out to N rows, each with its own idempotency
  // key (`${requirementId}#${page}`) so retry adds nothing. Owner/Approver come
  // from real config (Teams + Approval Matrix); campaign context is copied whole.
  for (const kr of brief.kols) {
    const expEng = (kr.likes || 0) + (kr.comments || 0) + (kr.shares || 0) + (kr.saves || 0) + (kr.clicks || 0);
    const owner = (kr.owner || "").trim() || kolAssign.owner;
    // Month buckets keep every page tied to ITS month's posting window and
    // per-month budget (Monthly split). Without a split, one bucket carries
    // the requirement's overall posting window — same behavior as before.
    const monthlyPlan = (kr.monthly ?? []).filter((m) => (m.pages || 0) > 0);
    const buckets = monthlyPlan.length
      ? monthlyPlan.map((m) => ({
          pages: m.pages,
          perPage: Math.round((m.budget || 0) / Math.max(1, m.pages)),
          start: m.postStart || kr.postingStart,
          end: m.postEnd || kr.postingEnd,
        }))
      : [{
          pages: Math.max(1, kr.count || 1),
          perPage: Math.round((kr.budget || 0) / Math.max(1, kr.count || 1)),
          start: kr.postingStart,
          end: kr.postingEnd,
        }];
    const pages = buckets.reduce((s, bkt) => s + bkt.pages, 0);
    let p = 0;
    for (const bucket of buckets) {
      for (let i = 0; i < bucket.pages; i++) {
        p++;
        const kol = buildKol({
          id: stamp + 900 + n * 10 + p, campaign: brief.name, b: brief.b, kolType: kr.kolType,
          count: 1, budget: bucket.perPage, deliverables: kr.contentRequired.join(" + "),
          notes: kr.note, name: kr.name ? (pages > 1 ? `${kr.name} #${p}` : kr.name) : undefined, handle: kr.handle || undefined,
          followers: kr.followers, expectedReach: kr.expectedReach, expectedEngagement: expEng,
          owner, approver: kolAssign.approver, requester: brief.plannerOwner, branch: kr.area, platform: kr.platforms[0],
          postingDate: labelDate(bucket.start), postingEnd: labelDate(bucket.end),
          campaignId: brief.id, sourceKolRequirementId: `${kr.id}#${p}`,
          objective: brief.objective, target: brief.audience, keyMsg: brief.mainMessage, offer: brief.offer,
          dueDate: labelDate(bucket.start),
        });
        // Upsert: new page → create; existing (same source id) → refresh its
        // requirement fields while preserving workflow progress (live two-way).
        const madeKol = await upsertKolRequirement(kol, kolRows);
        if (madeKol.created) kols++;
      }
    }
    const madeTask = await upsertBriefTask(mkTask(++n, {
      title: `KOL — ${kr.name || kr.kolType} × ${pages}`, type: "KOL", moduleIcon: "🤝", moduleColor: "#B5577E",
      owner, due: labelDate(kr.postingStart), dueIso: kr.postingStart, channel: kr.platforms.join(", "),
      nextAction: `${kr.area || "—"} · reach ${kr.expectedReach.toLocaleString()}`,
    }), `${brief.id}:kol:${kr.id}`);
    if (madeTask.created) tasks++;
  }

  // ── Ads setup tasks (one per funded platform) ──────────────────────────────
  const adsPlatforms = brief.budget.adsByPlatform.filter((a) => a.amount > 0);
  // Fall back to a real ad channel (Facebook / Instagram / …) rather than a generic "Ads".
  const adChannel = brief.channels.find((c) => /facebook|instagram|tiktok|google|youtube|line/i.test(c));
  const adsList = adsPlatforms.length ? adsPlatforms : (brief.budget.ads > 0 ? [{ platform: adChannel ?? "Ads", amount: brief.budget.ads }] : []);
  for (const a of adsList) {
    const madeTask = await upsertBriefTask(mkTask(++n, {
      title: `Ads setup — ${a.platform}`, type: "Ads", moduleIcon: "📣", moduleColor: "#C68A1E",
      owner: "", channel: a.platform, due: labelDate(brief.startDate), dueIso: brief.startDate,
      nextAction: `Budget ${a.amount.toLocaleString()} · launch ${labelDate(brief.startDate) || "TBD"}`,
    }), `${brief.id}:ads:${a.platform}`);
    if (madeTask.created) tasks++;
  }

  // ── CRM / LINE OA task ─────────────────────────────────────────────────────
  if (brief.channels.some((c) => /crm|line oa/i.test(c)) || brief.budget.crm > 0) {
    const madeTask = await upsertBriefTask(mkTask(++n, {
      title: `CRM / LINE OA — ${brief.name}`, type: "CRM", moduleIcon: "💬", moduleColor: "#4E7A4E",
      owner: "", due: labelDate(brief.startDate), dueIso: brief.startDate, nextAction: "Plan LINE OA broadcast / CRM flow",
    }), `${brief.id}:crm`);
    if (madeTask.created) tasks++;
  }

  // ── Result report task ─────────────────────────────────────────────────────
  // Only when the campaign actually defined Success Metrics — otherwise there's
  // nothing to report against and the task is just noise sitting in My Tasks
  // for the whole flight.
  if (brief.successMetrics.length > 0) {
    const madeReportTask = await upsertBriefTask(mkTask(++n, {
      title: `Result report — ${brief.name}`, type: "Report", moduleIcon: "📊", moduleColor: "#B33A2E",
      owner: brief.plannerOwner, due: labelDate(brief.endDate), dueIso: brief.endDate,
      nextAction: `วัดผล: ${brief.successMetrics.join(", ")}`,
    }), `${brief.id}:report`);
    if (madeReportTask.created) tasks++;
  }

  // Mark that this plan has become real work at least once. Absence of the
  // stamp is what lets the Content tab tell "never made" from "made and then
  // deleted" — see approvedButNothingMade. Written only when something was
  // actually created, and only once: a re-save of an already materialised
  // campaign creates nothing and must not move the date.
  //
  // Best-effort and last, deliberately. The rows are already in; failing the
  // whole save because a bookkeeping stamp would not write would turn a
  // completed fan-out into an error the caller has to interpret.
  const madeSomething = content + graphics + kols + tasks > 0;
  if (madeSomething && !normalizedBrief.materialisedAt) {
    await markMaterialised(normalizedBrief.id).catch(() => {});
  }

  // Report the real materialised counts (idempotency may make a retry all-zero).
  return { campaign: row, created: { content, graphics, kols, tasks } };
}

/** Stamp the brief blob as materialised, without rewriting the rest of it. */
async function markMaterialised(id: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { data } = await db.from("campaigns").select("data").eq("id", id).maybeSingle();
  const blob = data?.data as CampaignBrief | undefined;
  if (!blob || blob.materialisedAt) return;
  const { data: written } = await db.from("campaigns")
    .update({ data: { ...blob, materialisedAt: new Date().toISOString() } }).eq("id", id).select("id, updated_at");
  adoptBriefVersion(id, written as { updated_at?: string }[] | null);
}

function dayOf(iso: string): number { const d = Number(iso?.split("-")[2]); return Number.isFinite(d) ? d : 0; }
function labelDate(iso: string): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-").map(Number);
  return m ? `${MON[m - 1]} ${d}` : "";
}

export class StaleBriefError extends Error {
  constructor() {
    super("แคมเปญนี้ถูกคนอื่นแก้ไปแล้วหลังจากคุณเปิดหน้านี้ — refresh เพื่อดูของล่าสุดก่อนบันทึกซ้ำ (ระบบไม่บันทึกทับให้ เพื่อไม่ให้งานของอีกฝ่ายหาย)");
    this.name = "StaleBriefError";
  }
}

/** Store the full brief object in campaigns.data (needs the jsonb column).
 *
 *  The brief is written as ONE blob, so a save is all-or-nothing against
 *  whatever the other person wrote: last-write-wins here means their entire
 *  edit disappears silently. The update is therefore conditioned on the row
 *  still carrying the updated_at we loaded — if it moved, we refuse rather than
 *  overwrite. `updated_at` is maintained by a DB trigger, so this cannot be
 *  defeated by a client that forgets to set it. */
async function persistBriefBlob(brief: CampaignBrief): Promise<void> {
  const db = supabase();
  if (!db) return;
  const seenAt = briefVersionOf(brief.id);
  let q = db.from("campaigns").update({ data: brief }).eq("id", brief.id);
  if (seenAt) q = q.eq("updated_at", seenAt);
  const { data, error } = await q.select("id, updated_at");
  assertDbOk(error, "บันทึกรายละเอียดแคมเปญไม่สำเร็จ");
  if (!data?.length) {
    // Zero rows has two causes and they need different words. Ask whether the
    // row is there at all: if it is, somebody else got there first; if it is
    // not, the id is stale or RLS is hiding it.
    const { data: exists } = await db.from("campaigns").select("id").eq("id", brief.id).maybeSingle();
    if (exists && seenAt) throw new StaleBriefError();
    throw new Error("บันทึกรายละเอียดแคมเปญไม่สำเร็จ — ไม่พบแคมเปญนี้ (อาจถูกลบ หรือคุณไม่มีสิทธิ์แก้) ลอง refresh แล้วบันทึกใหม่");
  }
  // Move our marker forward so a second save in the same session still works.
  adoptBriefVersion(brief.id, data as { updated_at?: string }[]);
}

/** All saved briefs keyed by campaign name — one query, for pages that show
 *  budget breakdowns across many campaigns (Finance). */
export async function fetchAllBriefs(): Promise<Record<string, CampaignBrief>> {
  const db = supabase();
  if (!db) return {};
  const { data, error } = await db.from("campaigns").select("name,data");
  if (error || !data) return {};
  const out: Record<string, CampaignBrief> = {};
  for (const r of data) if (r.data) out[r.name as string] = r.data as CampaignBrief;
  return out;
}

/** Briefs indexed both ways. `byId` is keyed on campaigns.id — the only key
 *  that is actually unique — and is what anything holding a campaignId should
 *  use. `byName` is the legacy map, kept for rows written before campaignId
 *  existed; two campaigns sharing a name collapse to one entry there, which is
 *  precisely why byId is the one to prefer. One query serves both. */
export async function fetchBriefIndex(): Promise<{ byId: Record<string, CampaignBrief>; byName: Record<string, CampaignBrief> }> {
  const db = supabase();
  const empty = { byId: {} as Record<string, CampaignBrief>, byName: {} as Record<string, CampaignBrief> };
  if (!db) return empty;
  const { data, error } = await db.from("campaigns").select("id,name,data");
  if (error || !data) return empty;
  const byId: Record<string, CampaignBrief> = {};
  const byName: Record<string, CampaignBrief> = {};
  for (const r of data) {
    if (!r.data) continue;
    byId[String(r.id)] = r.data as CampaignBrief;
    byName[r.name as string] = r.data as CampaignBrief;
  }
  return { byId, byName };
}

/** Read a saved brief back (campaigns.data). Returns null when unavailable. */
export async function fetchCampaignBrief(id: string): Promise<CampaignBrief | null> {
  const db = supabase();
  if (!db) return null;
  // updated_at comes back with the brief so a later save can prove nobody else
  // wrote to the row in between. Selected tolerantly: a database that has not
  // run campaign_concurrency.sql simply has no version, and saves behave as
  // they did before rather than failing.
  const { data, error } = await db.from("campaigns").select("data, updated_at").eq("id", id).maybeSingle();
  if (error || !data?.data) {
    const fallback = await db.from("campaigns").select("data").eq("id", id).maybeSingle();
    if (fallback.error || !fallback.data?.data) return null;
    forgetBriefVersion(id);
    return fallback.data.data as CampaignBrief;
  }
  noteBriefVersion(id, (data as { updated_at?: string }).updated_at);
  return data.data as CampaignBrief;
}

/** Take a content item out of a campaign's plan, because its post has been
 *  moved to another campaign.
 *
 *  Moving a post rewrote the post row and nothing else, so the campaign it left
 *  went on listing the item in Edit Campaign → Content Plan — the work looked
 *  un-moved from the campaign side while Content Plan showed it gone. A plan
 *  that still claims work being done elsewhere is worse than no plan.
 *
 *  Recorded in the approval log rather than removed quietly: a content item
 *  disappearing from a brief is exactly the kind of change someone will later
 *  ask about.
 *
 *  Best-effort by design — the post has already moved, and failing to tidy the
 *  old plan must not undo that or block the person doing it. */
export async function detachBriefContentItem(
  campaignId: string, itemId: string, by: string, movedTo: string,
): Promise<boolean> {
  const db = supabase();
  if (!db || !campaignId || !itemId) return false;
  const brief = await fetchCampaignBrief(campaignId);
  if (!brief) return false;
  const item = brief.content?.find((c) => c.id === itemId);
  if (!item) return false;                       // nothing to detach
  const next: CampaignBrief = {
    ...brief,
    content: brief.content.filter((c) => c.id !== itemId),
    approvalLog: [...(brief.approvalLog ?? []), {
      action: "Content item moved to another campaign",
      by,
      at: new Date().toISOString(),
      comment: `“${item.title || itemId}” ย้ายไปแคมเปญ “${movedTo}”`,
    }],
  };
  await persistBriefBlob(next);
  return true;
}

/** Reverse two-way sync (KOL row → Campaign Builder KOL Plan): when a KOL that
 *  came from a brief requirement is edited, recompute that requirement item from
 *  its live sibling rows (count, budget, platform, and the specialist's proposed
 *  page when there's a single one). No-op for manual/unlinked KOLs. */
export async function syncBriefKolFromRows(kol: Kol): Promise<void> {
  const db = supabase();
  if (!db || !kol.campaignId || !kol.sourceKolRequirementId) return;
  const baseId = kol.sourceKolRequirementId.split("#")[0];
  const brief = await fetchCampaignBrief(kol.campaignId);
  if (!brief) return;
  const item = brief.kols.find((k) => k.id === baseId);
  if (!item) return; // manual Request-KOL rows don't map to a builder item

  const siblings = (await fetchKolsForCampaign(kol.campaignId))
    .filter((k) => (k.sourceKolRequirementId || "").split("#")[0] === baseId);
  if (!siblings.length) return;

  item.count = siblings.length;
  item.budget = siblings.reduce((s, k) => s + (k.fee || 0), 0);
  item.platforms = Array.from(new Set(siblings.map((k) => k.plat).filter(Boolean)));
  // When the requirement resolved to a single real page, surface it back.
  if (siblings.length === 1) {
    const only = siblings[0];
    if (only.name && !/^new request/i.test(only.name)) item.name = only.name;
    if (only.h && only.h !== "@tbd") item.handle = only.h;
  }
  const { data: written, error } = await db.from("campaigns")
    .update({ data: brief }).eq("id", kol.campaignId).select("id, updated_at");
  assertDbOk(error, "Could not sync KOL changes back to campaign brief");
  adoptBriefVersion(kol.campaignId, written as { updated_at?: string }[] | null);
}

/** Two-way sync: a New Post created in the Content Calendar (using the same
 *  content-item form as the builder) is written back into its campaign's
 *  Content Plan. No-op when the campaign has no brief or Supabase is unconfigured. */
export async function appendBriefItem(campaignName: string, item: BriefContentItem): Promise<void> {
  const db = supabase();
  if (!db || !campaignName || campaignName === "—") return;
  const camp = (await fetchCampaigns()).find((c) => c.name === campaignName);
  if (!camp) return;
  const brief = await fetchCampaignBrief(camp.id);
  if (!brief) return;
  const nextId = item.id || `ci-cal-${Date.now()}`;
  const existingIndex = brief.content.findIndex((c) => c.id === nextId);
  if (existingIndex >= 0) brief.content[existingIndex] = { ...item, id: nextId };
  else brief.content = [...brief.content, { ...item, id: nextId }];
  const { data: written, error } = await db.from("campaigns")
    .update({ data: brief }).eq("id", camp.id).select("id, updated_at");
  assertDbOk(error, "Could not sync content item back to campaign brief");
  adoptBriefVersion(camp.id, written as { updated_at?: string }[] | null);
}

/** Two-way sync for KOL: a "Request KOL" created in the KOL module (using the
 *  same KOL-item form as the Campaign Builder's KOL Plan) is written back into
 *  its campaign's KOL Plan. No-op when the campaign has no brief / Supabase off. */
export async function appendBriefKolItem(campaignName: string, item: BriefKolItem): Promise<void> {
  const db = supabase();
  if (!db || !campaignName || campaignName === "—") return;
  const camp = (await fetchCampaigns()).find((c) => c.name === campaignName);
  if (!camp) return;
  const brief = await fetchCampaignBrief(camp.id);
  if (!brief) {
    // Campaign has no brief (created outside the wizard) — the fee must still
    // count toward the campaign's committed budget, not vanish.
    const spend = (camp.spend || 0) + (item.budget || 0);
    const { data: written, error } = await db.from("campaigns")
      .update({ spend, budget: Math.max(camp.budget || 0, spend) }).eq("id", camp.id).select("id, updated_at");
    assertDbOk(error, "Could not sync KOL budget to campaign");
    adoptBriefVersion(camp.id, written as { updated_at?: string }[] | null);
    return;
  }
  brief.kols = [...brief.kols, { ...item, id: item.id || `kr-req-${Date.now()}` }];
  // Re-derive the campaign's committed budget so the row (Budget/Spend shown on
  // the Campaigns list, detail header, Finance) moves together with the plan.
  const s = budgetSummary(brief);
  const { data: written, error } = await db.from("campaigns").update({
    data: brief, spend: s.allocated, budget: Math.max(brief.budget.total || 0, s.allocated),
  }).eq("id", camp.id).select("id, updated_at");
  assertDbOk(error, "Could not sync KOL item back to campaign brief");
  adoptBriefVersion(camp.id, written as { updated_at?: string }[] | null);
}

/** Append an approval-log entry + status change to a saved brief.
 *
 *  Returns the brief AS WRITTEN so the caller can hand that same object to
 *  saveCampaignBrief — the caller's own copy may predate other people's (or
 *  other buttons') writes, and persisting it verbatim has silently erased
 *  approval-log entries in production. Returns null without writing when the
 *  brief is missing OR already in `status`: the second of two Approve clicks
 *  must become a no-op, not a second fan-out. */
export async function logBriefApproval(id: string, entry: ApprovalLogEntry, status: string): Promise<CampaignBrief | null> {
  const db = supabase();
  if (!db) return null;
  const brief = await fetchCampaignBrief(id);
  if (!brief) return null;
  if (brief.status === status) return null;
  brief.approvalLog = [...(brief.approvalLog ?? []), entry];
  brief.status = status as CampaignBrief["status"];
  const nextApproval = status === "Waiting for Approval" ? (brief.approver || DEFAULT_APPROVER) : "None";
  // Adopt the version this write produced. Approving runs the fan-out
  // (saveCampaignBrief) immediately afterwards, so a marker left pointing at the
  // row as it was BEFORE this update makes that save look like someone else's
  // edit — which is exactly how approved campaigns ended up with no posts.
  const { data: written, error } = await db.from("campaigns")
    .update({ data: brief, status, next_approval: nextApproval }).eq("id", id).select("id, updated_at");
  assertDbOk(error, "Could not save campaign approval status");
  adoptBriefVersion(id, written as { updated_at?: string }[] | null);
  logAudit(`Brief ${brief.name || id}: ${entry.action}`, "Campaign", {
    after: status, actorName: entry.by, meta: { campaignId: id, comment: entry.comment },
  });
  return brief;
}
