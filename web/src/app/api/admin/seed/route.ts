import { NextResponse } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { BRANDS, BRAND_ORDER } from "@/lib/brands";
import { CAMPAIGNS } from "@/lib/data/campaigns";
import { TASKS } from "@/lib/data/tasks";
import { CONTENT } from "@/lib/data/content";
import { GRAPHICS } from "@/lib/data/graphic";
import { KOLS } from "@/lib/data/kol";
import { BUDGET_SECTIONS, EXPENSES, REQUESTS as FIN_REQUESTS, PNL } from "@/lib/data/finance";
import { REQUESTS, ASSETS } from "@/lib/data/requests";
import { MEMBERS } from "@/lib/data/workload";
import { USERS_DATA, PERM_MODULES, PERM_ROLES, ORG_FIELDS } from "@/lib/data/settings";
import { WORK_SECTIONS } from "@/lib/data/workflow";
import { AGENCY_TASKS } from "@/lib/data/agency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// name → brand id (task brand comes as a display name like "Teppen")
const brandId = (v: string) => {
  const low = (v || "").toLowerCase();
  if (BRANDS[low as keyof typeof BRANDS]) return low;
  const hit = BRAND_ORDER.find((id) => BRANDS[id].name.toLowerCase() === low);
  return hit ?? null;
};
const campById = Object.fromEntries(CAMPAIGNS.map((c) => [c.name, c.id]));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export async function POST(req: Request) {
  if (!isAdminConfigured) {
    return NextResponse.json({ error: "Supabase service role not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." }, { status: 400 });
  }
  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: "Unauthorized. Send header: Authorization: Bearer <service_role_key>." }, { status: 401 });
  }

  const db = supabaseAdmin()!;
  const out: Record<string, number | string> = {};
  const run = async (table: string, rows: Record<string, unknown>[], onConflict?: string) => {
    try {
      // idempotent: clear identity tables; upsert keyed tables
      if (onConflict) {
        const { error } = await db.from(table).upsert(rows, { onConflict });
        if (error) throw error;
      } else {
        await db.from(table).delete().neq("id", -1);
        const { error } = await db.from(table).insert(rows);
        if (error) throw error;
      }
      out[table] = rows.length;
    } catch (e) {
      out[table] = `ERROR: ${(e as Error).message}`;
    }
  };

  // Parents first (keyed upserts)
  await run("brands", BRAND_ORDER.map((id) => ({ id, name: BRANDS[id].name, color: BRANDS[id].color })), "id");
  await run("campaigns", CAMPAIGNS.map((c) => ({
    id: c.id, name: c.name, brand: c.b, branch: c.branch, owner: c.owner, budget: c.budget, spend: c.spend,
    roi: c.roi, dates: c.dates, status: c.status, camp_type: c.campType, readiness: c.readiness,
    task_blocked: c.taskBlocked, task_waiting: c.taskWaiting, task_overdue: c.taskOverdue, task_total: c.taskTotal,
    task_done: c.taskDone, task_in_progress: c.taskInProgress, bottleneck_team: c.bottleneckTeam, next_approval: c.nextApproval,
  })), "id");

  // Children (delete + insert)
  await run("tasks", TASKS.map((t) => ({
    title: t.title, brand: brandId(t.brand), campaign: t.campaign, campaign_id: campById[t.campaign] ?? null,
    assignee: t.assignee, type: t.type, priority: t.priority, status: t.status, due: t.due,
    next_action: t.nextAction, blocker: t.blocker, checklist: t.checklist ?? [], done: t.status === "Done",
  })));
  await run("content_posts", CONTENT.map((c) => ({
    title: c.title, brand: c.b, campaign: c.campaign, campaign_id: campById[c.campaign] ?? null,
    platforms: (c as { platforms?: string[] }).platforms ?? [c.plat], status: c.status, day: c.day, time: c.time,
    owner: c.owner, caption: c.caption, asset: (c as { assetStatus?: string }).assetStatus ?? null,
  })));
  await run("graphic_requests", GRAPHICS.map((g) => ({
    title: g.title, brand: g.b, campaign: g.campaign, campaign_id: campById[g.campaign] ?? null,
    designer: g.designer, requester: g.requester, approver: g.approver, type: g.type, priority: g.priority,
    stage: g.stage, due: g.due, platform: g.platform, size: g.size, brief_complete: g.briefComplete,
    blocker: g.blocker, next_action: g.nextAction,
  })));
  await run("kols", KOLS.map((k) => ({
    name: k.name, handle: k.h, brand: k.b, campaign: k.campaign, tier: k.kolType, platform: k.plat,
    followers: k.followers, rate: k.fee, status: k.status, stage: null, owner: k.owner,
  })));
  await run("budget_items", BUDGET_SECTIONS.flatMap((s) => s.items.map((i) => ({
    section_key: s.key, section_label: s.label, name: i.name, budget: i.budget, actual: i.actual,
  }))));
  await run("expenses", EXPENSES.map((e) => ({ vendor: e.vendor, category: e.category, brand: e.b, amount: e.amount, vat: e.vat, date: e.date, status: e.status })));
  await run("expense_requests", FIN_REQUESTS.map((r) => ({ category: r.category, brand: r.b, campaign: r.campaign, requested: r.requested, approved: r.approved, due: r.due, status: r.status })));
  await run("pnl", PNL.map((p) => ({ name: p.name, brand: p.b, revenue: p.revenue, budget: p.budget, expense: p.expense, roi: p.roi, roas: p.roas })));
  await run("requests", REQUESTS.map((r) => ({
    id: r.id, type: r.type, type_icon: r.typeIcon, title: r.title, brand: r.b, campaign: r.campaign,
    campaign_id: campById[r.campaign] ?? null, requester: r.requester, approver: r.approver, due: r.due, stage: r.stage, priority: r.priority,
  })), "id");
  await run("assets", ASSETS.map((a) => ({ name: a.name, type: a.type, brand: a.b, campaign: a.campaign, version: a.version, approval: a.approval, updated: a.updated, drive_url: a.driveUrl ?? null, canva_url: a.canvaUrl ?? null })));
  await run("workload_members", MEMBERS.map((m) => ({ name: m.name, role: m.role, team: null, color: null, capacity: m.capacityTarget, assigned: m.tasks, status: m.capacityStatus })));
  await run("members", USERS_DATA.map((u) => ({ email: u.email, name: u.name, role: u.role, access: u.access, brand_access: u.brandAccess, status: u.status, color: u.color })), "email");
  await run("permissions", PERM_ROLES.map((r) => ({ role: r.role, descr: r.desc, perms: r.perms.map((p, i) => ({ module: PERM_MODULES[i], level: p.l })) })), "role");
  await run("org_settings", ORG_FIELDS.map((f) => ({ key: slug(f.label), label: f.label, value: f.value })), "key");
  await run("workflow_tasks", WORK_SECTIONS.flatMap((s) => s.tasks.map((t) => ({
    section_key: s.key, en: t.en, jp: t.jp, responsible: t.r, accountable: t.a, link: t.link ?? null, note: t.note ?? null, qty: t.qty ?? null, marks: t.marks,
  }))));
  await run("agency_tasks", AGENCY_TASKS.map((t) => ({ title: t.title, brand: t.b, campaign: t.campaign, campaign_id: campById[t.campaign] ?? null, type: t.type, status: t.status, due: t.due, brief: t.brief, link: t.link, note: t.note })));

  return NextResponse.json({ ok: true, seeded: out });
}
