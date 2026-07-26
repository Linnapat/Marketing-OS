"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { Segmented } from "@/components/ui/Segmented";
import { BrandFilterValue, BrandId, brandName } from "@/lib/brands";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { useRole } from "@/lib/role";
import { clsx } from "@/lib/clsx";
import {
  CampaignGroup, Health, HEALTH_META, HEALTH_ORDER, MODULE_LABEL, ModuleKey,
  UNASSIGNED, WorkItem,
  contentItems, expenseItems, graphicItems, groupByCampaign, kolItems, taskItems,
} from "@/lib/data/statusBoard";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { fetchContent } from "@/lib/db/content";
import { fetchGraphics } from "@/lib/db/graphic";
import { fetchKols } from "@/lib/db/kol";
import { fetchTasks } from "@/lib/db/tasks";
import { fetchExpenseRequests } from "@/lib/db/finance";

const ALL_MODULES: ModuleKey[] = ["content", "graphic", "kol", "task", "expense"];

/** Which Settings → Permissions module each lane belongs to. The route itself
 *  is ungated (it spans every module), so the gate is applied per lane instead:
 *  a role with no Finance access must not read expense rows here that it can't
 *  open in Cashier. Tasks are cross-cutting and ungated, same as /my-tasks. */
const MODULE_MATRIX: Partial<Record<ModuleKey, string>> = {
  content: "Content", graphic: "Graphic", kol: "KOL", expense: "Finance",
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

  // Only the lanes this role may see are fetched. Filtering after the fetch
  // would still ship every expense and KOL row to a browser whose role has no
  // access to them: RLS on these tables authorises any authenticated staff and
  // knows nothing about the Settings matrix, so the client is the only gate
  // there is. Keyed by name, not array identity — `can` is rebuilt on every
  // RoleProvider render and would otherwise refetch in a loop.
  const moduleKey = allowedModules.join(",");
  useEffect(() => {
    let alive = true;
    const want = new Set(moduleKey.split(",") as ModuleKey[]);
    const none = <T,>(v: T) => Promise.resolve(v);
    Promise.all([
      fetchCampaigns(),
      want.has("content") ? fetchContent() : none([]),
      want.has("graphic") ? fetchGraphics() : none([]),
      want.has("kol") ? fetchKols() : none([]),
      want.has("task") ? fetchTasks() : none({ tasks: [], doneIds: [] }),
      want.has("expense") ? fetchExpenseRequests() : none([]),
    ]).then(([campaigns, content, graphics, kols, taskData, expenses]) => {
      if (!alive) return;
      const items: WorkItem[] = [
        ...contentItems(content),
        ...graphicItems(graphics),
        ...kolItems(kols),
        ...taskItems(taskData.tasks, new Set(taskData.doneIds)),
        ...expenseItems(expenses),
      ];
      setGroups(groupByCampaign(
        campaigns.map((c) => ({ id: c.id, name: c.name, b: c.b, status: c.status })),
        items,
      ));
      setLoading(false);
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [moduleKey]);

  // Filters apply to the work items, then the group is re-counted — filtering
  // the groups alone would leave a campaign showing counts for hidden items.
  const visible = useMemo(() => {
    const modSet = new Set(modules);
    return groups
      .map((g) => {
        const items = g.items.filter((i) =>
          modSet.has(i.module)
          && (health === "all" || i.health === health)
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
  }, [groups, modules, health, brand, brandVisibility, allowedModules.length]);

  const totals = useMemo(() => {
    const t = { blocked: 0, waiting: 0, active: 0, notStarted: 0, done: 0 } as Record<Health, number>;
    visible.forEach((g) => g.items.forEach((i) => { t[i.health] += 1; }));
    return t;
  }, [visible]);

  const totalItems = Object.values(totals).reduce((a, b) => a + b, 0);
  const toggleModule = (m: ModuleKey) =>
    setModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  return (
    <>
      <PageHeader
        eyebrow="QA"
        title="Status Dashboard"
        subtitle="ทุกงานในระบบ จัดกลุ่มตามแคมเปญ — Content, Graphic, KOL, Task และ Expense อยู่ในหน้าเดียว"
        right={loading ? "กำลังโหลด…" : `${totalItems} งาน · ${visible.length} แคมเปญ`}
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
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
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

      {!loading && (
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
      ) : visible.length === 0 ? (
        <div className="bg-surface border border-line rounded-cardLg py-16 text-center">
          <div className="text-[15px] font-bold text-ink">ไม่มีงานตรงกับตัวกรอง</div>
          <div className="text-[13px] text-faint mt-1">ลองเอาตัวกรองสถานะหรือโมดูลออก</div>
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
