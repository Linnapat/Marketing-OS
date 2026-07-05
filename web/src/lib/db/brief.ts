// Persist a Campaign Brief and fan it out into the rest of Marketing OS:
// real content posts, graphic requests (for every content item that needs a
// graphic), KOL requests, and tasks (content / KOL / ads / CRM / report) — all
// linked back to the campaign. Finance is deliberately left untouched: budget
// allocation lives on the brief only.

import { supabase } from "@/lib/supabase";
import { CampaignBrief, ApprovalLogEntry, emptyContentItem, BriefContentItem } from "@/lib/data/brief";
import { CampaignRow } from "@/lib/data/campaigns";
import { createCampaign, fetchCampaigns } from "./campaigns";
import { createContent } from "./content";
import { createGraphic, buildGraphic } from "./graphic";
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
    owner: brief.plannerOwner || "Unassigned", budget: brief.budget.total, spend: 0, roi: 0,
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
      id: `c${stamp}${n}`, day: dayOf(ci.publishDate) || 1, time: "10:00", title: ci.title || `${brief.name} — Content ${n + 1}`,
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
      // One creative/graphic per Platform + Asset Size pair. Fall back to the
      // platforms themselves when no explicit size pairs were chosen.
      const pairs = ci.assets.length ? ci.assets : plats.map((p) => ({ platform: p, size: "" }));
      for (const a of pairs) {
        const gid = stamp + 500 + n;
        const sizeTag = a.size ? ` (${a.size})` : "";
        const g: Graphic = {
          ...buildGraphic({
            id: gid, b: brief.b, campaign: brief.name, title: `${ci.title || "Content"} — ${a.platform}${sizeTag}`,
            type: ci.type, due: labelDate(ci.publishDate) || "TBD", designer: "Unassigned",
            requester: brief.plannerOwner, approver: brief.approver, channels: [a.platform],
          }),
          stage: "Waiting for Creative",
          size: a.size || "—",
          nextAction: `KV: ${brief.kvDirection || "—"} · Msg: ${ci.mainMessage || brief.mainMessage || "—"}`,
          contentItem: ci.title || "—",
        };
        await createGraphic(g); graphics++;
        await createTaskDb(mkTask(++n, {
          title: `Graphic — ${ci.title || ci.type} · ${a.platform}${sizeTag}`, type: "Graphic", moduleIcon: "🎨", moduleColor: "#C68A1E",
          owner: "", priority: ci.priority, due: labelDate(ci.publishDate), dueIso: ci.publishDate,
          channel: a.platform, relatedGraphicId: String(gid), nextAction: `Deliver ${a.size || "artwork"} for ${a.platform}`,
        }));
      }
    }
  }

  // ── KOL requirements → KOL requests + KOL tasks ────────────────────────────
  for (const kr of brief.kols) {
    const expEng = (kr.likes || 0) + (kr.comments || 0) + (kr.shares || 0) + (kr.saves || 0) + (kr.clicks || 0);
    await createKol(buildKol({
      id: stamp + 900 + n, campaign: brief.name, b: brief.b, kolType: kr.kolType,
      count: kr.count || 1, budget: kr.budget || 0, deliverables: kr.contentRequired.join(" + "),
      notes: kr.note, name: kr.name || undefined, expectedReach: kr.expectedReach, expectedEngagement: expEng,
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
  const adsList = adsPlatforms.length ? adsPlatforms : (brief.budget.ads > 0 ? [{ platform: "Ads", amount: brief.budget.ads }] : []);
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

/** Read a saved brief back (campaigns.data). Returns null when unavailable. */
export async function fetchCampaignBrief(id: string): Promise<CampaignBrief | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.from("campaigns").select("data").eq("id", id).maybeSingle();
  if (error || !data?.data) return null;
  return data.data as CampaignBrief;
}

/** Two-way sync: a New Post created in the Content Calendar is written back into
 *  its campaign's Content Plan (the brief). No-op when the campaign has no brief
 *  (e.g. not created via the builder) or Supabase isn't configured. */
export async function appendPostToBrief(campaignName: string, post: {
  title: string; platforms?: string[]; plat: string; day: number; time?: string;
}): Promise<void> {
  const db = supabase();
  if (!db || !campaignName || campaignName === "—") return;
  const camp = (await fetchCampaigns()).find((c) => c.name === campaignName);
  if (!camp) return;
  const brief = await fetchCampaignBrief(camp.id);
  if (!brief) return;
  const seq = brief.content.length + 1;
  const item: BriefContentItem = {
    ...emptyContentItem(seq),
    id: `ci-cal-${Date.now()}`,
    title: post.title,
    platforms: post.platforms?.length ? post.platforms : [post.plat],
    publishDate: `2026-07-${String(Math.max(1, Math.min(31, post.day))).padStart(2, "0")}`,
  };
  brief.content = [...brief.content, item];
  await db.from("campaigns").update({ data: brief }).eq("id", camp.id);
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
