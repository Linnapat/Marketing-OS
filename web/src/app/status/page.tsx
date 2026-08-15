"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { Segmented } from "@/components/ui/Segmented";
import { BrandFilterValue, BrandId, brandName } from "@/lib/brands";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { useRole } from "@/lib/role";
import { useDeadlines } from "@/lib/useDeadlines";
import { clsx } from "@/lib/clsx";
import {
  CampaignGroup, Health, HEALTH_META, HEALTH_ORDER, MODULE_LABEL, ModuleKey,
  UNASSIGNED, WorkItem,
  contentItems, expenseItems, graphicItems, groupByCampaign, kolItems, taskItems,
  storyboardItems, shootingItems,
  withUrgency, summarise, groupByOwner, URGENCY_META, NO_OWNER, DUE_SOON_DAYS, type Urgency, type OwnerLoad,
} from "@/lib/data/statusBoard";
import {
  TrackerCampaign, buildTracker, filterMonth,
  summarise as summariseTracker, UNASSIGNED as TRACKER_UNASSIGNED,
} from "@/lib/data/tracker";
import { CampaignSection, Kpi } from "@/components/tracker/TrackerCards";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { fetchContent } from "@/lib/db/content";
import { fetchGraphics } from "@/lib/db/graphic";
import { fetchKols } from "@/lib/db/kol";
import { fetchTasks } from "@/lib/db/tasks";
import { fetchExpenseRequests } from "@/lib/db/finance";

/** เดือนที่เลือกได้ในมุม "ตามโพสต์": เดือนนี้ ±3 */
function monthOptions(todayIso: string) {
  const [y, m] = todayIso.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - 2 + i, 1));
    return {
      value: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString("th-TH", { month: "short", year: "2-digit", timeZone: "UTC" }),
    };
  });
}

const ALL_MODULES: ModuleKey[] = ["content", "graphic", "storyboard", "shooting", "kol", "task", "expense"];

/** Which Settings → Permissions module each lane belongs to. The route itself
 *  is ungated (it spans every module), so the gate is applied per lane instead:
 *  a role with no Finance access must not read expense rows here that it can't
 *  open in Expenses. Tasks are cross-cutting and ungated, same as /my-tasks. */
const MODULE_MATRIX: Partial<Record<ModuleKey, string>> = {
  // Storyboard and Shooting are steps of a graphic request, so they follow
  // the Graphic module's permission — seeing them IS seeing that request.
  content: "Content", graphic: "Graphic", storyboard: "Graphic", shooting: "Graphic",
  kol: "KOL", expense: "Finance",
};

export default function StatusDashboardPage() {
  const brandVisibility = useBrandVisibility();
  const { can } = useRole();
  const allowedModules = useMemo(
    () => ALL_MODULES.filter((m) => { const mod = MODULE_MATRIX[m]; return !mod || can(mod); }),
    [can],
  );
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [health, setHealth] = useState<Health | "all">("all");
  const [modules, setModules] = useState<ModuleKey[]>(ALL_MODULES);
  // Keep the chip selection inside what the role may see — the matrix can change
  // under a signed-in user when a CMO edits Settings.
  useEffect(() => {
    setModules((prev) => {
      const next = prev.filter((m) => allowedModules.includes(m));
      return next.length ? next : allowedModules;
    });
  }, [allowedModules]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<CampaignGroup[]>([]);
  // "post" คือมุมที่ตอบว่า "โพสต์นี้ อาร์ตเวิร์ก/วิดีโอถึงไหนแล้ว" — สองมุมแรก
  // ตอบไม่ได้เพราะวาง Content กับ Graphic ไว้คนละแถว ไม่มีอะไรผูกกันบนจอ
  const [groupBy, setGroupBy] = useState<"campaign" | "owner" | "post">("campaign");
  const [urgency, setUrgency] = useState<Urgency | "all">("all");
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const months = useMemo(() => monthOptions(today), [today]);
  // มุมโพสต์เท่านั้นที่กรองตามเดือน อีกสองมุมยังแสดงทุกอย่างเหมือนเดิม —
  // ใส่ตัวกรองวันที่ให้ทั้งหน้าคือการทำให้แถวหายไปจากบอร์ดที่คนใช้อยู่ทุกวัน
  const [month, setMonth] = useState(today.slice(0, 7));
  const [tracker, setTracker] = useState<TrackerCampaign[]>([]);
  const [trackerLate, setTrackerLate] = useState(false);

  // Only the lanes this role may see are fetched. Filtering after the fetch
  // would still ship every expense and KOL row to a browser whose role has no
  // access to them: RLS on these tables authorises any authenticated staff and
  // knows nothing about the Settings matrix, so the client is the only gate
  // there is. Keyed by name, not array identity — `can` is rebuilt on every
  // RoleProvider render and would otherwise refetch in a loop.
  const moduleKey = allowedModules.join(",");
  // The calendar decides the storyboard deadline, and it loads asynchronously.
  // Held in a ref and depended on only through `calendarReady`, so the fetch
  // re-runs exactly once when the calendar lands — not on every render, which
  // is what depending on the hook's object identity would cause.
  const deadlines = useDeadlines();
  const deadlinesRef = useRef(deadlines);
  deadlinesRef.current = deadlines;
  const calendarReady = deadlines.ready;
  useEffect(() => {
    let alive = true;
    const want = new Set(moduleKey.split(",") as ModuleKey[]);
    const none = <T,>(v: T) => Promise.resolve(v);
    Promise.all([
      fetchCampaigns(),
      want.has("content") ? fetchContent() : none([]),
      // One fetch feeds three lanes — the two steps live on the same rows.
      (want.has("graphic") || want.has("storyboard") || want.has("shooting")) ? fetchGraphics() : none([]),
      want.has("kol") ? fetchKols() : none([]),
      want.has("task") ? fetchTasks() : none({ tasks: [], doneIds: [] }),
      want.has("expense") ? fetchExpenseRequests() : none([]),
    ]).then(([campaigns, content, graphics, kols, taskData, expenses]) => {
      if (!alive) return;
      const today = new Date().toISOString().slice(0, 10);
      const items: WorkItem[] = [
        ...(want.has("content") ? contentItems(content) : []),
        ...(want.has("graphic") ? graphicItems(graphics) : []),
        // The storyboard's deadline is the Team Calendar's, for the month this
        // request serves — the same date the drawer shows. Falls back to the
        // request's own due date when the calendar says nothing.
        ...(want.has("storyboard")
          ? storyboardItems(graphics, (g) => {
            const month = deadlinesRef.current.monthForFinalAw(g.dueIso);
            return month ? deadlinesRef.current.milestone("storyboard", month)?.iso : undefined;
          })
          : []),
        ...(want.has("shooting") ? shootingItems(graphics, today) : []),
        ...(want.has("kol") ? kolItems(kols) : []),
        ...(want.has("task") ? taskItems(taskData.tasks, new Set(taskData.doneIds)) : []),
        ...(want.has("expense") ? expenseItems(expenses) : []),
      ];
      // Urgency is stamped once here, at the edge, so "today" is read from one
      // clock rather than by each adapter.
      const dated = withUrgency(items, today);
      const seeds = campaigns.map((c) => ({ id: c.id, name: c.name, b: c.b, status: c.status }));
      setGroups(groupByCampaign(seeds, dated));
      // มุม "ตามโพสต์" ใช้แถวชุดเดียวกับที่ดึงมาแล้ว ไม่ยิงเพิ่ม — และสร้างจาก
      // โพสต์ทุกเดือน แล้วค่อยกรองเดือนตอนแสดง ถ้ากรองก่อน ใบงานที่ผูกกับโพสต์
      // เดือนอื่นจะจับคู่ไม่เจอ แล้วไปโผล่เป็นใบลอยทั้งที่มีโพสต์อยู่
      setTracker(want.has("content") ? buildTracker(seeds, content, graphics, today) : []);
      setLoading(false);
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [moduleKey, calendarReady]);

  // Filters apply to the work items, then the group is re-counted — filtering
  // the groups alone would leave a campaign showing counts for hidden items.
  const visible = useMemo(() => {
    const modSet = new Set(modules);
    return groups
      .map((g) => {
        const items = g.items.filter((i) =>
          modSet.has(i.module)
          && (health === "all" || i.health === health)
          && (urgency === "all" || i.urgency === urgency)
          && (brand === "all" || i.brand === brand || (!i.brand && g.brand === brand))
          && (i.brand ? brandVisibility.isVisible(i.brand) : true));
        return { ...g, items };
      })
      .filter((g) => {
        if (g.campaignId !== UNASSIGNED && !brandVisibility.isVisible(g.brand as BrandId)) return false;
        if (brand !== "all" && g.campaignId !== UNASSIGNED && g.brand !== brand) return false;
        // A campaign with nothing left after filtering is noise, unless no
        // filter is on — then an empty campaign is itself worth seeing.
        const filtered = health !== "all" || modules.length !== allowedModules.length || brand !== "all";
        return filtered ? g.items.length > 0 : true;
      });
  }, [groups, modules, health, urgency, brand, brandVisibility, allowedModules.length]);

  // มุมโพสต์: กรองด้วยเดือน แบรนด์ สถานะ และ "เฉพาะที่สาย" ใช้ตัวกรองแถวบน
  // ร่วมกับอีกสองมุม ยกเว้นชิปโมดูลที่ไม่มีความหมายกับการ์ด (การ์ดหนึ่งใบคือ
  // Content + Graphic ต่อกันอยู่แล้ว) จึงซ่อนไปในมุมนี้
  const visibleTracker = useMemo(() => {
    return filterMonth(tracker, month)
      .map((g) => ({
        ...g,
        posts: g.posts.filter((p) =>
          (brand === "all" || p.brand === brand)
          && brandVisibility.isVisible(p.brand)
          && (health === "all" || p.health === health)
          && (urgency === "all" || p.urgency === urgency)
          && (!trackerLate || p.urgency === "overdue" || p.jobsOverdue > 0)),
        looseJobs: (brand === "all" && health === "all" && urgency === "all" && !trackerLate) ? g.looseJobs : [],
      }))
      .filter((g) => g.posts.length > 0 || g.looseJobs.length > 0)
      .filter((g) => g.campaignId === TRACKER_UNASSIGNED || !g.brand || brandVisibility.isVisible(g.brand));
  }, [tracker, month, brand, health, urgency, trackerLate, brandVisibility]);

  const trackerSummary = useMemo(() => summariseTracker(visibleTracker), [visibleTracker]);

  const totals = useMemo(() => {
    const t = { blocked: 0, waiting: 0, active: 0, notStarted: 0, done: 0 } as Record<Health, number>;
    visible.forEach((g) => g.items.forEach((i) => { t[i.health] += 1; }));
    return t;
  }, [visible]);

  const totalItems = Object.values(totals).reduce((a, b) => a + b, 0);
  // Summary and owner rollup read the FILTERED items, so the headline numbers
  // always describe what is on screen rather than a hidden superset.
  const visibleItems = useMemo(() => visible.flatMap((g) => g.items), [visible]);
  const summary = useMemo(() => summarise(visibleItems), [visibleItems]);
  const ownerLoads = useMemo(() => groupByOwner(visibleItems), [visibleItems]);
  const toggleModule = (m: ModuleKey) =>
    setModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  return (
    <>
      <PageHeader
        eyebrow="QA"
        title="Status Dashboard"
        subtitle="ทุกงานในระบบ — Content, Graphic, Story board, Shooting, KOL, Task และ Expense อยู่ในหน้าเดียว · ดูตามแคมเปญ ตามคน หรือตามโพสต์ว่างานผลิตถึงไหนแล้ว"
        right={loading ? "กำลังโหลด…"
          : groupBy === "post" ? `${trackerSummary.posts} โพสต์ · ${trackerSummary.jobs} ใบงาน`
            : `${totalItems} งาน · ${visible.length} แคมเปญ`}
      />

      <div className="bg-surface border border-line rounded-cardLg p-4 mb-3">
        <div className="flex flex-wrap items-center gap-3">
          <BrandFilter value={brand} onChange={setBrand} />
          <Segmented
            value={health}
            onChange={(v) => setHealth(v as Health | "all")}
            options={[
              { value: "all", label: "ทั้งหมด" },
              ...HEALTH_ORDER.map((h) => ({ value: h, label: HEALTH_META[h].label })),
            ]}
          />
          <Segmented
            value={groupBy}
            onChange={(v) => setGroupBy(v as "campaign" | "owner" | "post")}
            options={[
              { value: "campaign", label: "ตามแคมเปญ" },
              { value: "owner", label: "ตามคน" },
              ...(allowedModules.includes("content") ? [{ value: "post" as const, label: "ตามโพสต์" }] : []),
            ]}
          />
          {groupBy === "post" && <Segmented value={month} onChange={setMonth} options={months} />}
        </div>
        {/* ชิปโมดูลไม่มีความหมายในมุมโพสต์ — การ์ดหนึ่งใบคือ Content บวก Graphic
            ต่อกันอยู่แล้ว ปิด lane ใดก็เท่ากับทำให้การ์ดพูดไม่ครบ */}
        <div className={clsx("mt-3 flex-wrap items-center gap-2", groupBy === "post" ? "hidden" : "flex")}>
          <span className="text-[11px] font-bold text-faint uppercase tracking-[0.08em]">โมดูล</span>
          {allowedModules.map((m) => (
            <button
              key={m}
              onClick={() => toggleModule(m)}
              className={clsx(
                "rounded-pill px-3 py-1 text-[11.5px] font-bold border transition",
                modules.includes(m)
                  ? "bg-accent-soft border-accent-border text-accent"
                  : "bg-surface border-line2 text-faint",
              )}
            >
              {MODULE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {/* What needs someone today, before any scrolling. Health alone could not
          say it: nearly every item in the system maps to "not started", so the
          pile was one colour and the late work was invisible inside it. */}
      {/* มุมโพสต์นับคนละหน่วย (โพสต์และใบงาน ไม่ใช่ work item) จึงมีชุดตัวเลข
          ของตัวเอง — โดยเฉพาะ "ใบงานเลยกำหนด" ที่ปฏิทินโพสต์มองไม่เห็น */}
      {!loading && groupBy === "post" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <Kpi
            label="ใบงานเลยกำหนด" value={trackerSummary.jobsOverdue}
            fg="#B33A2E" bg="#FFF5F4" border="#F5C8C4"
            hint="ใบงานเลย due แล้ว แม้โพสต์ยังไม่ถึงวันลง"
            active={trackerLate} onClick={() => setTrackerLate((v) => !v)}
          />
          <Kpi label="โพสต์เลยวันลง" value={trackerSummary.overdue} fg="#B3641E" bg="#FFF7ED" border="#F0C89B" hint="ถึงวันลงแล้วแต่ยังไม่เสร็จ" />
          <Kpi label="ยังไม่มีใบงาน" value={trackerSummary.noJob} fg="#8A6D1E" bg="#FBF6EC" border="#EADBC1" hint="โพสต์ที่ยังไม่มีใครเปิดงานให้" />
          <Kpi label="ยังไม่มีคนถือ" value={trackerSummary.unassigned} fg="#6F6A86" bg="#F4F2F8" border="#E6E1EF" hint="มีใบงานแล้วแต่ยังไม่ระบุ designer" />
        </div>
      )}

      {!loading && groupBy !== "post" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {([
            ["overdue", "เลยกำหนดแล้ว", summary.overdue, "#B33A2E", "#FFF5F4", "#F5C8C4"],
            ["dueSoon", `ครบกำหนดใน ${DUE_SOON_DAYS} วัน`, summary.dueSoon, "#B3641E", "#FFF7ED", "#F0C89B"],
            ["all", "ติดปัญหา", summary.blocked, "#B33A2E", "#FBF3F1", "#E8C5BC"],
            ["all", "รออนุมัติ", summary.waiting, "#8A6D1E", "#FBF6EC", "#EADBC1"],
          ] as const).map(([key, label, value, fg, bg, border], i) => (
            <button
              key={i}
              onClick={() => {
                if (key === "all") { setHealth(label === "ติดปัญหา" ? "blocked" : "waiting"); setUrgency("all"); }
                else { setUrgency(urgency === key ? "all" : key); setHealth("all"); }
              }}
              className="rounded-card px-4 py-3 text-left border transition"
              style={{ background: bg, borderColor: border }}
            >
              <div className="text-[22px] font-extrabold leading-none" style={{ color: fg }}>{value}</div>
              <div className="mt-1 text-[11.5px] font-bold" style={{ color: fg }}>{label}</div>
            </button>
          ))}
        </div>
      )}

      {!loading && groupBy === "campaign" && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
          {HEALTH_ORDER.map((h) => (
            <button
              key={h}
              onClick={() => setHealth(health === h ? "all" : h)}
              className={clsx(
                "bg-surface border rounded-card px-4 py-3 text-left transition",
                health === h ? "border-accent-border" : "border-line",
              )}
            >
              <div className="text-[11px] font-bold text-faint uppercase tracking-[0.08em]">{HEALTH_META[h].label}</div>
              <div className="text-[22px] font-extrabold text-ink mt-[2px]">{totals[h]}</div>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="bg-surface border border-line rounded-cardLg py-16 text-center text-[13px] text-faint">
          กำลังรวมงานจากทุกโมดูล…
        </div>
      ) : groupBy === "post" ? (
        // แยกสาขาก่อนเช็ค visible.length เพราะมุมนี้นับคนละกอง — โพสต์ในเดือน
        // ที่เลือก ไม่ใช่ work item ทั้งระบบ ถ้าใช้ตัวเช็คร่วมกันจะขึ้น "ไม่มีงาน"
        // ทั้งที่มีการ์ดอยู่ หรือกลับกัน
        visibleTracker.length === 0 ? (
          <div className="bg-surface border border-line rounded-cardLg py-16 text-center">
            <div className="text-[15px] font-bold text-ink">ไม่มีโพสต์ตรงกับตัวกรอง</div>
            <div className="text-[13px] text-faint mt-1">ลองเปลี่ยนเดือน หรือเอาตัวกรองสถานะออก</div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleTracker.map((g) => (
              <CampaignSection
                key={`post:${g.campaignId}`}
                group={g}
                showJobs={allowedModules.includes("graphic")}
                collapsed={open[`post:${g.campaignId}`] === false}
                onToggle={() => setOpen((p) => ({ ...p, [`post:${g.campaignId}`]: p[`post:${g.campaignId}`] === false }))}
              />
            ))}
          </div>
        )
      ) : visible.length === 0 ? (
        <div className="bg-surface border border-line rounded-cardLg py-16 text-center">
          <div className="text-[15px] font-bold text-ink">ไม่มีงานตรงกับตัวกรอง</div>
          <div className="text-[13px] text-faint mt-1">ลองเอาตัวกรองสถานะหรือโมดูลออก</div>
        </div>
      ) : groupBy === "owner" ? (
        <div className="flex flex-col gap-2">
          {ownerLoads.length === 0 ? (
            <div className="bg-surface border border-line rounded-cardLg py-16 text-center text-[13px] text-faint">ไม่มีงานค้างตามตัวกรองนี้</div>
          ) : ownerLoads.map((load) => (
            <OwnerRow
              key={load.owner}
              load={load}
              open={!!open[`owner:${load.owner}`]}
              onToggle={() => setOpen((p) => ({ ...p, [`owner:${load.owner}`]: !p[`owner:${load.owner}`] }))}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((g) => (
            <CampaignRow
              key={g.campaignId}
              group={g}
              open={!!open[g.campaignId]}
              onToggle={() => setOpen((p) => ({ ...p, [g.campaignId]: !p[g.campaignId] }))}
            />
          ))}
        </div>
      )}
    </>
  );
}

function CampaignRow({ group, open, onToggle }: { group: CampaignGroup; open: boolean; onToggle: () => void }) {
  const unassigned = group.campaignId === UNASSIGNED;
  const meta = HEALTH_META[group.health];
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-ivory transition">
        <span className="text-faint shrink-0">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        {!unassigned && group.brand && <BrandDot brand={group.brand} />}
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold text-ink truncate">{group.name}</div>
          <div className="text-[11.5px] text-faint truncate">
            {unassigned
              ? "งานที่ยังไม่ผูกกับแคมเปญไหน — ตรวจชื่อแคมเปญในต้นทาง"
              : `${group.brand ? brandName(group.brand) : "—"}${group.status ? ` · ${group.status}` : ""}`}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {HEALTH_ORDER.filter((h) => group.counts[h] > 0).map((h) => (
            <span
              key={h}
              title={HEALTH_META[h].label}
              className="rounded-pill px-[8px] py-[2px] text-[11px] font-bold"
              style={{ background: toneBg(h), color: toneFg(h) }}
            >
              {group.counts[h]}
            </span>
          ))}
        </div>
        <div className="shrink-0 w-[86px] text-right">
          {group.items.length === 0
            ? <span className="text-[11.5px] text-faint">ยังไม่มีงาน</span>
            : <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>}
        </div>
      </button>

      {open && group.items.length > 0 && (
        <div className="border-t border-line3">
          {group.items.map((i) => (
            // Phone keeps only the title and its badge on the main line; module,
            // status and owner fold into a second line. Laying them out as
            // fixed-width columns at 375px left the title about 40px — one
            // character — which is what this looked like before.
            <div key={i.id} className="flex items-center gap-3 px-4 py-[9px] border-b border-line4 last:border-b-0">
              <span className="hidden sm:block text-[10.5px] font-bold text-faint w-[58px] shrink-0">{MODULE_LABEL[i.module]}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] text-ink truncate">{i.title}</div>
                <div className="sm:hidden text-[10.5px] text-faint truncate">
                  {MODULE_LABEL[i.module]} · {i.rawStatus}{i.owner ? ` · ${i.owner}` : ""}
                </div>
              </div>
              <span className="text-[11.5px] text-faint truncate hidden md:block w-[110px] shrink-0">{i.owner || "—"}</span>
              <span className="text-[11px] text-muted truncate hidden sm:block w-[130px] shrink-0 text-right">{i.rawStatus}</span>
              <span className="shrink-0 flex justify-end">
                <StatusBadge tone={HEALTH_META[i.health].tone}>{HEALTH_META[i.health].label}</StatusBadge>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TONE_BG: Record<Health, string> = {
  blocked: "#FFF0F0", waiting: "#FFF3D7", active: "#EEE9FF", notStarted: "#F4F2F8", done: "#F0F8D8",
};
const TONE_FG: Record<Health, string> = {
  blocked: "#E15B5B", waiting: "#B78E2D", active: "#4D61D6", notStarted: "#8A879A", done: "#5D9E35",
};
const toneBg = (h: Health) => TONE_BG[h];
const toneFg = (h: Health) => TONE_FG[h];

/** One person's open work, worst-first. Answers "who do I go and talk to",
 *  which grouping by campaign never could. */
function OwnerRow({ load, open, onToggle }: { load: OwnerLoad; open: boolean; onToggle: () => void }) {
  const nobody = load.owner === NO_OWNER;
  const name = nobody ? "ยังไม่มีเจ้าของ" : load.owner;
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-ivory/60">
        <span className="text-[11px] text-faint w-3">{open ? "▾" : "▸"}</span>
        <span className={clsx("text-[13.5px] font-bold min-w-0 truncate", nobody && "text-faint italic")}>{name}</span>
        <div className="ml-auto flex items-center gap-[6px] flex-wrap justify-end">
          {load.overdue > 0 && (
            <span className="rounded-pill px-2.5 py-[3px] text-[11px] font-bold" style={{ background: "#FFF5F4", color: "#B33A2E" }}>
              เลยกำหนด {load.overdue}
            </span>
          )}
          {load.dueSoon > 0 && (
            <span className="rounded-pill px-2.5 py-[3px] text-[11px] font-bold" style={{ background: "#FFF7ED", color: "#B3641E" }}>
              ใกล้ครบ {load.dueSoon}
            </span>
          )}
          {load.blocked > 0 && (
            <span className="rounded-pill px-2.5 py-[3px] text-[11px] font-bold" style={{ background: "#FBF3F1", color: "#B33A2E" }}>
              ติดปัญหา {load.blocked}
            </span>
          )}
          <span className="text-[12px] font-semibold text-muted">{load.total} งาน</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-line4">
          {load.items
            .slice()
            .sort((a, b) => {
              const rank = (u: Urgency) => (u === "overdue" ? 0 : u === "dueSoon" ? 1 : u === "later" ? 2 : 3);
              const d = rank(a.urgency) - rank(b.urgency);
              return d !== 0 ? d : (a.dueIso ?? "").localeCompare(b.dueIso ?? "");
            })
            .map((i) => (
              <div key={i.id} className="px-4 py-2 border-b border-line4 last:border-0 flex items-center gap-3">
                <span className="text-[10.5px] font-bold rounded-pill px-2 py-[2px] bg-ivory text-faint whitespace-nowrap">{MODULE_LABEL[i.module]}</span>
                <span className="text-[12.5px] font-semibold truncate min-w-0">{i.title}</span>
                <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] text-faint whitespace-nowrap">{i.rawStatus}</span>
                  {i.urgency !== "none" && i.urgency !== "later" && (
                    <span className="text-[11px] font-bold whitespace-nowrap" style={{ color: i.urgency === "overdue" ? "#B33A2E" : "#B3641E" }}>
                      {i.dueIso ?? URGENCY_META[i.urgency].label}
                    </span>
                  )}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
