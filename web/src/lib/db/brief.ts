// Persist a Campaign Brief and fan it out into the rest of Marketing OS:
// real content posts, graphic requests (for every content item that needs a
// graphic), KOL requests, and tasks (content / KOL / ads / CRM / report) — all
// linked back to the campaign. Finance is deliberately left untouched: budget
// allocation lives on the brief only.

import { supabase } from "@/lib/supabase";
import { CampaignBrief, ApprovalLogEntry, BriefContentItem, BriefKolItem, budgetSummary } from "@/lib/data/brief";
import { CampaignRow } from "@/lib/data/campaigns";
import { createCampaign, fetchCampaigns } from "./campaigns";
import { createContentIfNew, fetchContentSourceIds } from "./content";
import { createGraphicIfNew, fetchGraphicSourceIds, buildGraphic } from "./graphic";
import { autoNumberDeliverables, emptyDeliverable } from "@/lib/data/graphic";
import { upsertKolRequirement, fetchKolsForCampaign, buildKol } from "./kol";
import { Kol } from "@/lib/data/kol";
import { resolveKolAssignment } from "./assignments";
import { upsertBriefTask } from "./tasks";
import { ContentItem } from "@/lib/data/content";
import { Graphic } from "@/lib/data/graphic";
import { Task } from "@/lib/data/tasks";
import { brandName } from "@/lib/brands";
import { assertDbOk } from "@/lib/db/assert";
import { DEFAULT_APPROVER } from "@/lib/approval";
import { logAudit } from "@/lib/db/audit";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtRange(startIso: string, endIso: string): string {
  const one = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return m ? `${MON[m - 1]} ${d}` : ""; };
  const a = one(startIso), b = one(endIso);
  return a && b ? `${a} – ${b}` : a || b || "TBD";
}

export interface BriefSaveResult {
  campaign: CampaignRow;
  created: { content: number; graphics: number; kols: number; tasks: number };
}

/** The row types this expands into (kept in one place for the preview + save). */
export async function saveCampaignBrief(brief: CampaignBrief): Promise<BriefSaveResult> {
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
    dates: fmtRange(normalizedBrief.startDate, normalizedBrief.endDate), status: normalizedBrief.status,
    campType: normalizedBrief.campaignType || normalizedBrief.objective, readiness: "needs_attention",
    taskBlocked: 0, taskWaiting: 0, taskOverdue: 0, taskTotal: 0, taskDone: 0, taskInProgress: 0,
    bottleneckTeam: "None", nextApproval: normalizedBrief.status === "Waiting for Approval" ? (normalizedBrief.approver || DEFAULT_APPROVER) : "None",
  };
  await createCampaign(row);
  await persistBriefBlob(normalizedBrief);

  // Idempotency: what's already been materialised for this campaign, so a repeat
  // Submit / retry creates nothing new. Keyed by real source ids, not names.
  const [contentSeen, graphicSeen, kolRows, kolAssign] = await Promise.all([
    fetchContentSourceIds(normalizedBrief.id),
    fetchGraphicSourceIds(normalizedBrief.id),
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
  // "Approved" (or later), so the Content Calendar / Creative Kitchen never
  // show work from an unapproved campaign.
  const materialize = ["Approved", "In Progress", "Completed"].includes(normalizedBrief.status);
  if (!materialize) {
    return { campaign: row, created: { content: 0, graphics: 0, kols: 0, tasks: 0 } };
  }

  // ── Content items → content posts + graphic requests + content/graphic tasks ─
  // Each row carries campaignId + sourceContentItemId; createXIfNew skips when
  // the pair already exists, so re-Submit is a no-op (no duplicates, no dupe tasks).
  let n = 0;
  for (const ci of normalizedBrief.content) {
    const plats = ci.platforms.length ? ci.platforms : ["Instagram"];
    // Video work needs a Creative request just like graphic work — a content
    // item with only "Needs Video" used to become a bare task, so VDO pieces
    // never reached Creative Kitchen and were never counted in Artwork Count.
    const needsCreative = ci.requiredGraphic || ci.requiredVideo;
    const gid = needsCreative ? stamp + 500 + n : undefined;
    const post: ContentItem = {
      // No publish date yet → fall back to the campaign Start Date (stays inside the
      // campaign window) rather than day 1 of the month.
      id: `c${stamp}${n}`, day: dayOf(ci.publishDate) || dayOf(normalizedBrief.startDate) || 1,
      dateIso: ci.publishDate || normalizedBrief.startDate || undefined, time: "10:00", title: ci.title || `${normalizedBrief.name} — Content ${n + 1}`,
      b: normalizedBrief.b, plat: plats[0], platforms: plats, status: ci.status || "Draft", campaign: normalizedBrief.name,
      campaignId: normalizedBrief.id, sourceContentItemId: ci.id, graphicRequestId: gid ? String(gid) : undefined,
      requester: ci.requester, designer: ci.designer, approver: ci.approver,
      // Owner is assigned later inside the Creative team — leave unassigned here.
      owner: "Unassigned", caption: "", hashtags: "", cta: ci.cta || "",
      // Brief guide for the caption writer.
      subHead: ci.subHead || undefined, mainMessage: ci.mainMessage || undefined,
      productHighlight: ci.productHighlight || undefined, captionDirection: ci.captionDirection || undefined,
      driveLink: ci.driveLink || undefined,
      mandatoryText: ci.mandatoryText || undefined, doDont: ci.doDont || undefined,
      captionStatus: "Missing", assetStatus: needsCreative ? "Waiting Design" : "No Asset",
      approvalStatus: "Draft", publishStatus: "Draft",
    };
    const madeContent = await createContentIfNew(post, contentSeen);
    if (madeContent.created) {
      content++;
      // A content item with creative produces one Graphic work item only. The
      // Content Calendar post remains linked, but does not duplicate My Tasks.
      if (!needsCreative) {
        const madeTask = await upsertBriefTask(mkTask(++n, {
          title: `${ci.title || "Content"} — ${ci.type}`, type: "Content", moduleIcon: "📝", moduleColor: "#3E5C9A",
          owner: "", priority: ci.priority, due: labelDate(ci.publishDate), dueIso: ci.publishDate,
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
      const deliverables = autoNumberDeliverables(pairs.map((a) => emptyDeliverable(a.platform, a.size || "—", ci.referenceBriefLink || "")));
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
        driveLink: ci.driveLink || "",
        referenceLink: ci.referenceImageLink || ci.competitorLink || "",
        captionCopy: ci.captionDirection || "",
        extraDetails: ci.doDont || ci.mandatoryText || "",
        briefLink: ci.referenceBriefLink || "",
        nextAction: `KV: ${normalizedBrief.kvDirection || "—"} · Msg: ${ci.mainMessage || normalizedBrief.mainMessage || "—"}`,
        contentItem: ci.title || "—",
      };
      const madeGraphic = await createGraphicIfNew(g, graphicSeen);
      if (madeGraphic.created) {
        graphics++;
        const madeTask = await upsertBriefTask(mkTask(++n, {
          title: `Graphic — ${ci.title || ci.type} (${deliverables.length} asset)`, type: "Graphic", moduleIcon: "🎨", moduleColor: "#C68A1E",
          owner: "", priority: ci.priority, due: labelDate(ci.graphicDueDate || ci.publishDate), dueIso: ci.graphicDueDate || ci.publishDate,
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

  // Report the real materialised counts (idempotency may make a retry all-zero).
  return { campaign: row, created: { content, graphics, kols, tasks } };
}

function dayOf(iso: string): number { const d = Number(iso?.split("-")[2]); return Number.isFinite(d) ? d : 0; }
function labelDate(iso: string): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-").map(Number);
  return m ? `${MON[m - 1]} ${d}` : "";
}

/** Store the full brief object in campaigns.data (needs the jsonb column). */
async function persistBriefBlob(brief: CampaignBrief): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("campaigns").update({ data: brief }).eq("id", brief.id);
  assertDbOk(error, "Could not save campaign brief details");
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

/** Read a saved brief back (campaigns.data). Returns null when unavailable. */
export async function fetchCampaignBrief(id: string): Promise<CampaignBrief | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.from("campaigns").select("data").eq("id", id).maybeSingle();
  if (error || !data?.data) return null;
  return data.data as CampaignBrief;
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
  const { error } = await db.from("campaigns").update({ data: brief }).eq("id", kol.campaignId);
  assertDbOk(error, "Could not sync KOL changes back to campaign brief");
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
  const { error } = await db.from("campaigns").update({ data: brief }).eq("id", camp.id);
  assertDbOk(error, "Could not sync content item back to campaign brief");
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
    const { error } = await db.from("campaigns").update({ spend, budget: Math.max(camp.budget || 0, spend) }).eq("id", camp.id);
    assertDbOk(error, "Could not sync KOL budget to campaign");
    return;
  }
  brief.kols = [...brief.kols, { ...item, id: item.id || `kr-req-${Date.now()}` }];
  // Re-derive the campaign's committed budget so the row (Budget/Spend shown on
  // the Campaigns list, detail header, Finance) moves together with the plan.
  const s = budgetSummary(brief);
  const { error } = await db.from("campaigns").update({
    data: brief, spend: s.allocated, budget: Math.max(brief.budget.total || 0, s.allocated),
  }).eq("id", camp.id);
  assertDbOk(error, "Could not sync KOL item back to campaign brief");
}

/** Append an approval-log entry + status change to a saved brief. */
export async function logBriefApproval(id: string, entry: ApprovalLogEntry, status: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  const brief = await fetchCampaignBrief(id);
  if (!brief) return;
  brief.approvalLog = [...(brief.approvalLog ?? []), entry];
  brief.status = status as CampaignBrief["status"];
  const nextApproval = status === "Waiting for Approval" ? (brief.approver || DEFAULT_APPROVER) : "None";
  const { error } = await db.from("campaigns").update({ data: brief, status, next_approval: nextApproval }).eq("id", id);
  assertDbOk(error, "Could not save campaign approval status");
  logAudit(`Brief ${brief.name || id}: ${entry.action}`, "Campaign", {
    after: status, actorName: entry.by, meta: { campaignId: id, comment: entry.comment },
  });
}
