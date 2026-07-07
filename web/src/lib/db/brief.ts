// Persist a Campaign Brief and fan it out into the rest of Marketing OS:
// real content posts, graphic requests (for every content item that needs a
// graphic), KOL requests, and tasks (content / KOL / ads / CRM / report) — all
// linked back to the campaign. Finance is deliberately left untouched: budget
// allocation lives on the brief only.

import { supabase } from "@/lib/supabase";
import { CampaignBrief, ApprovalLogEntry, BriefContentItem, BriefKolItem, budgetSummary } from "@/lib/data/brief";
import { CampaignRow } from "@/lib/data/campaigns";
import { createCampaign, fetchCampaigns } from "./campaigns";
import { createContent } from "./content";
import { createGraphic, buildGraphic } from "./graphic";
import { emptyDeliverable } from "@/lib/data/graphic";
import { createKol, buildKol } from "./kol";
import { createTaskDb } from "./tasks";
import { ContentItem } from "@/lib/data/content";
import { Graphic } from "@/lib/data/graphic";
import { Task } from "@/lib/data/tasks";
import { brandName } from "@/lib/brands";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtRange(startIso: string, endIso: string): string {
  const one = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return m ? `${MON[m - 1]} ${d}` : ""; };
  const a = one(startIso), b = one(endIso);
  return a && b ? `${a} – ${b}` : a || b || "TBD";
}

export interface BriefSaveResult {
  campaign: CampaignRow;
  created: { content: number; graphics: number; kols: number; tasks: number };
}

/** The row types this expands into (kept in one place for the preview + save). */
export async function saveCampaignBrief(brief: CampaignBrief): Promise<BriefSaveResult> {
  const bn = brandName(brief.b);
  const stamp = Date.now();

  const row: CampaignRow = {
    id: brief.id, name: brief.name, b: brief.b, branch: brief.branch,
    // spend seeds Finance "Committed" — the amount allocated across buckets at plan time.
    owner: brief.plannerOwner || "Unassigned", budget: brief.budget.total, spend: budgetSummary(brief).allocated, roi: 0,
    dates: fmtRange(brief.startDate, brief.endDate), status: brief.status,
    campType: brief.campaignType || brief.objective, readiness: "needs_attention",
    taskBlocked: 0, taskWaiting: 0, taskOverdue: 0, taskTotal: 0, taskDone: 0, taskInProgress: 0,
    bottleneckTeam: "None", nextApproval: brief.approver || "CMO",
  };
  await createCampaign(row);
  await persistBriefBlob(brief);

  let content = 0, graphics = 0, kols = 0, tasks = 0;

  const mkTask = (n: number, opts: Omit<Partial<Task>, "priority"> & { title: string; type: string; owner: string; priority?: string }): Task => ({
    id: stamp + n, title: opts.title, module: opts.type, moduleIcon: opts.moduleIcon ?? "📋",
    moduleColor: opts.moduleColor ?? "#6b6258", type: opts.type, assignee: opts.owner || "Unassigned",
    brand: bn, campaign: brief.name, status: "Todo", priority: ((opts.priority as Task["priority"]) || "Med"),
    group: "quickWins", due: opts.due ?? "TBD", blocker: null, pendingApprover: null, isQuickWin: false,
    nextAction: opts.nextAction ?? "Start when ready.", checklist: [], channel: opts.channel,
    relatedBrief: brief.id, relatedGraphicId: opts.relatedGraphicId, dueIso: opts.dueIso,
  });

  // ── Content items → content posts + graphic requests + content/graphic tasks ─
  let n = 0;
  for (const ci of brief.content) {
    const plats = ci.platforms.length ? ci.platforms : ["Instagram"];
    const post: ContentItem = {
      // No publish date yet → fall back to the campaign Start Date (stays inside the
      // campaign window) rather than day 1 of the month.
      id: `c${stamp}${n}`, day: dayOf(ci.publishDate) || dayOf(brief.startDate) || 1, time: "10:00", title: ci.title || `${brief.name} — Content ${n + 1}`,
      b: brief.b, plat: plats[0], platforms: plats, status: ci.status || "Draft", campaign: brief.name,
      // Owner is assigned later inside the Creative team — leave unassigned here.
      owner: "Unassigned", caption: "", hashtags: "", cta: "",
      captionStatus: "Missing", assetStatus: ci.requiredGraphic ? "Waiting Design" : "No Asset",
      approvalStatus: "Draft", publishStatus: "Draft",
    };
    await createContent(post); content++;
    await createTaskDb(mkTask(++n, {
      title: `${ci.title || "Content"} — ${ci.type}`, type: "Content", moduleIcon: "📝", moduleColor: "#3E5C9A",
      owner: "", priority: ci.priority, due: labelDate(ci.publishDate), dueIso: ci.publishDate,
      nextAction: `${plats.join(", ")} · publish ${labelDate(ci.publishDate) || "TBD"}`,
    }));

    if (ci.requiredGraphic) {
      // ONE graphic request per content item, carrying a deliverable per
      // Platform × Asset Size the content needs. The requester (Planner) approves.
      const gid = stamp + 500 + n;
      const pairs = ci.assets.length ? ci.assets : plats.map((p) => ({ platform: p, size: "" }));
      const deliverables = pairs.map((a) => emptyDeliverable(a.platform, a.size || "—", ci.referenceBriefLink || ""));
      const g: Graphic = {
        ...buildGraphic({
          id: gid, b: brief.b, campaign: brief.name, title: `${ci.title || "Content"} — ${ci.type}`,
          type: ci.type, due: labelDate(ci.publishDate) || "TBD", designer: "Unassigned",
          requester: brief.plannerOwner, approver: brief.plannerOwner, channels: plats,
        }),
        stage: "New Request",
        size: pairs.map((a) => a.size).filter(Boolean).join(" · ") || "—",
        deliverables,
        nextAction: `KV: ${brief.kvDirection || "—"} · Msg: ${ci.mainMessage || brief.mainMessage || "—"}`,
        contentItem: ci.title || "—",
      };
      await createGraphic(g); graphics++;
      await createTaskDb(mkTask(++n, {
        title: `Graphic — ${ci.title || ci.type} (${deliverables.length} asset)`, type: "Graphic", moduleIcon: "🎨", moduleColor: "#C68A1E",
        owner: "", priority: ci.priority, due: labelDate(ci.publishDate), dueIso: ci.publishDate,
        channel: plats.join(", "), relatedGraphicId: String(gid), nextAction: `Deliver ${deliverables.length} asset(s)`,
      }));
    }
  }

  // ── KOL requirements → KOL requests + KOL tasks ────────────────────────────
  for (const kr of brief.kols) {
    const expEng = (kr.likes || 0) + (kr.comments || 0) + (kr.shares || 0) + (kr.saves || 0) + (kr.clicks || 0);
    await createKol(buildKol({
      id: stamp + 900 + n, campaign: brief.name, b: brief.b, kolType: kr.kolType,
      count: kr.count || 1, budget: kr.budget || 0, deliverables: kr.contentRequired.join(" + "),
      notes: kr.note, name: kr.name || undefined, handle: kr.handle || undefined,
      followers: kr.followers, expectedReach: kr.expectedReach, expectedEngagement: expEng,
      owner: kr.owner, branch: kr.area, platform: kr.platforms[0],
      postingDate: labelDate(kr.postingStart), contactStatus: "Prospect",
    })); kols++;
    await createTaskDb(mkTask(++n, {
      title: `KOL — ${kr.name || kr.kolType} × ${kr.count}`, type: "KOL", moduleIcon: "🤝", moduleColor: "#B5577E",
      owner: kr.owner, due: labelDate(kr.postingStart), dueIso: kr.postingStart, channel: kr.platforms.join(", "),
      nextAction: `${kr.area || "—"} · reach ${kr.expectedReach.toLocaleString()}`,
    }));
  }

  // ── Ads setup tasks (one per funded platform) ──────────────────────────────
  const adsPlatforms = brief.budget.adsByPlatform.filter((a) => a.amount > 0);
  // Fall back to a real ad channel (Facebook / Instagram / …) rather than a generic "Ads".
  const adChannel = brief.channels.find((c) => /facebook|instagram|tiktok|google|youtube|line/i.test(c));
  const adsList = adsPlatforms.length ? adsPlatforms : (brief.budget.ads > 0 ? [{ platform: adChannel ?? "Ads", amount: brief.budget.ads }] : []);
  for (const a of adsList) {
    await createTaskDb(mkTask(++n, {
      title: `Ads setup — ${a.platform}`, type: "Ads", moduleIcon: "📣", moduleColor: "#C68A1E",
      owner: "", channel: a.platform, due: labelDate(brief.startDate), dueIso: brief.startDate,
      nextAction: `Budget ${a.amount.toLocaleString()} · launch ${labelDate(brief.startDate) || "TBD"}`,
    }));
  }

  // ── CRM / LINE OA task ─────────────────────────────────────────────────────
  if (brief.channels.some((c) => /crm|line oa/i.test(c)) || brief.budget.crm > 0) {
    await createTaskDb(mkTask(++n, {
      title: `CRM / LINE OA — ${brief.name}`, type: "CRM", moduleIcon: "💬", moduleColor: "#4E7A4E",
      owner: "", due: labelDate(brief.startDate), dueIso: brief.startDate, nextAction: "Plan LINE OA broadcast / CRM flow",
    }));
  }

  // ── Result report task ─────────────────────────────────────────────────────
  await createTaskDb(mkTask(++n, {
    title: `Result report — ${brief.name}`, type: "Report", moduleIcon: "📊", moduleColor: "#B33A2E",
    owner: brief.plannerOwner, due: labelDate(brief.endDate), dueIso: brief.endDate,
    nextAction: `วัดผล: ${brief.successMetrics.join(", ") || "—"}`,
  }));

  tasks = n - content - graphics; // tasks created beyond the content/graphic pairs are ads/crm/report/kol
  return { campaign: row, created: { content, graphics, kols, tasks: countTasks(brief) } };
}

// Total tasks the save will have created (for the result summary).
function countTasks(brief: CampaignBrief): number {
  const graphics = brief.content.filter((c) => c.requiredGraphic).length;
  const ads = brief.budget.adsByPlatform.filter((a) => a.amount > 0).length || (brief.budget.ads > 0 ? 1 : 0);
  const crm = brief.channels.some((c) => /crm|line oa/i.test(c)) || brief.budget.crm > 0 ? 1 : 0;
  return brief.content.length + graphics + brief.kols.length + ads + crm + 1; // +1 report
}

function dayOf(iso: string): number { const d = Number(iso?.split("-")[2]); return Number.isFinite(d) ? d : 0; }
function labelDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return m ? `${MON[m - 1]} ${d}` : "";
}

/** Store the full brief object in campaigns.data (best-effort; needs the jsonb column). */
async function persistBriefBlob(brief: CampaignBrief): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.from("campaigns").update({ data: brief }).eq("id", brief.id);
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
  brief.content = [...brief.content, { ...item, id: `ci-cal-${Date.now()}` }];
  await db.from("campaigns").update({ data: brief }).eq("id", camp.id);
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
    await db.from("campaigns").update({ spend, budget: Math.max(camp.budget || 0, spend) }).eq("id", camp.id);
    return;
  }
  brief.kols = [...brief.kols, { ...item, id: `kr-req-${Date.now()}` }];
  // Re-derive the campaign's committed budget so the row (Budget/Spend shown on
  // the Campaigns list, detail header, Finance) moves together with the plan.
  const s = budgetSummary(brief);
  await db.from("campaigns").update({
    data: brief, spend: s.allocated, budget: Math.max(brief.budget.total || 0, s.allocated),
  }).eq("id", camp.id);
}

/** Append an approval-log entry + status change to a saved brief. */
export async function logBriefApproval(id: string, entry: ApprovalLogEntry, status: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  const brief = await fetchCampaignBrief(id);
  if (!brief) return;
  brief.approvalLog = [...(brief.approvalLog ?? []), entry];
  brief.status = status as CampaignBrief["status"];
  await db.from("campaigns").update({ data: brief, status }).eq("id", id);
}
