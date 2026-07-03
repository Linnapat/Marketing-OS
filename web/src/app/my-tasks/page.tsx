"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  TASKS, Task, PEOPLE, PERSON_COLOR, PERSON_ROLE, GREETINGS, TASK_GROUPS,
  STATUS_TONE, PRIORITY_TONE, TYPE_TONE, CELEBRATIONS, teamSummary,
} from "@/lib/data/tasks";

export default function MyTasksPage() {
  const [tab, setTab] = useState<"myDay" | "team">("myDay");
  const [viewAs, setViewAs] = useState(PEOPLE[0]);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [doneIds, setDoneIds] = useState<Set<number>>(new Set());
  const [tasks, setTasks] = useState<Task[]>(TASKS);
  const [drawer, setDrawerId] = useState<number | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const drawerTask = drawer !== null ? tasks.find((t) => t.id === drawer) ?? null : null;
  const statusOf = (t: Task) => (doneIds.has(t.id) ? "Done" : t.status);
  const groupOf = (t: Task) => (doneIds.has(t.id) ? "done" : t.group);

  const markDone = (id: number) => {
    setDoneIds((s) => new Set(s).add(id));
    setDrawerId(null);
    const msg = CELEBRATIONS[id % CELEBRATIONS.length];
    setCelebration(msg);
    setTimeout(() => setCelebration((c) => (c === msg ? null : c)), 3000);
  };

  const createTask = (t: Task) => {
    setTasks((ts) => [t, ...ts]);
    setNewOpen(false);
  };

  const reassign = (id: number, to: string) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, assignee: to } : t)));
  };

  const mine = useMemo(() => tasks.filter((t) => t.assignee === viewAs), [tasks, viewAs]);
  const [greetTitle, greetSub] = GREETINGS[viewAs];

  const summary = {
    today: mine.filter((t) => statusOf(t) !== "Done").length,
    done: mine.filter((t) => statusOf(t) === "Done").length,
    waiting: mine.filter((t) => statusOf(t) === "Waiting").length,
    needApproval: mine.filter((t) => statusOf(t) === "Need Approval").length,
    stuck: mine.filter((t) => statusOf(t) === "Stuck").length,
    quick: mine.filter((t) => t.isQuickWin && statusOf(t) !== "Done").length,
  };
  const doneToday = summary.done;
  const totalToday = mine.length;

  return (
    <>
      <PageHeader
        eyebrow="My Tasks"
        title={tab === "myDay" ? "My Day" : "Team View"}
        subtitle={tab === "myDay" ? "Your focus for today — small wins count 🌿" : "Everyone's workload at a glance."}
        right={
          <div className="flex flex-col items-end gap-[10px]">
            <button onClick={() => setNewOpen(true)} className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[8px]">+ New Task</button>
            <div className="flex items-center gap-[6px] flex-wrap justify-end">
              <span className="text-[11px] font-bold text-faint uppercase tracking-[0.05em] mr-1">Viewing as</span>
              {PEOPLE.map((p) => {
                const active = p === viewAs;
                return (
                  <button key={p} onClick={() => setViewAs(p)} className="text-[11px] px-[10px] py-[4px] rounded-pill whitespace-nowrap"
                    style={active ? { fontWeight: 700, background: "#211F1C", color: "#fff" } : { fontWeight: 500, border: "1px solid #E5DECF", color: "#6b6258", background: "#fff" }}>
                    {p.split(" ")[0]}
                  </button>
                );
              })}
            </div>
          </div>
        }
      />

      <div className="mt-4">
        <Segmented value={tab} onChange={setTab} options={[{ value: "myDay", label: "My Day" }, { value: "team", label: "Team View" }]} />
      </div>

      {tab === "myDay" ? (
        <>
          {/* Greeting */}
          <div className="mt-4 bg-panel text-white rounded-cardLg px-6 py-5">
            <div className="text-[19px] font-extrabold">{greetTitle}</div>
            <div className="text-[13px] text-white/60 mt-1">{greetSub}</div>
            <div className="flex gap-5 mt-4 flex-wrap">
              {[["Today", summary.today], ["Done today", summary.done], ["Waiting for me", summary.waiting], ["Need approval", summary.needApproval], ["Stuck", summary.stuck], ["Quick wins", summary.quick]].map(([l, v]) => (
                <div key={l as string}>
                  <div className="text-[22px] font-extrabold" style={{ color: (l === "Stuck" && (v as number) > 0) ? "#f0a89f" : "#fff" }}>{v as number}</div>
                  <div className="text-[10.5px] text-white/50 uppercase tracking-[0.04em] font-bold mt-[2px]">{l as string}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bento progress */}
          <div className="mt-4 bg-accent-soft border border-accent-border rounded-cardLg px-5 py-4 flex items-center gap-4 flex-wrap">
            <span className="text-[22px]">🍱</span>
            <div className="flex-1 min-w-[180px]">
              <div className="text-[13px] font-bold text-ink">Today&apos;s Bento — {doneToday}/{totalToday} cleared</div>
              <div className="h-[7px] bg-white rounded-full overflow-hidden mt-2"><div className="h-full rounded-full" style={{ width: `${totalToday ? (doneToday / totalToday) * 100 : 0}%`, background: "#B8945A" }} /></div>
            </div>
            <div className="text-[12.5px] text-status-gold font-semibold italic">You&apos;re almost there — keep going 🌿</div>
          </div>

          {/* View toggle */}
          <div className="mt-5 flex justify-end">
            <Segmented value={viewMode} onChange={setViewMode} options={[{ value: "cards", label: "⊞ Cards" }, { value: "list", label: "≡ List" }]} />
          </div>

          {/* Today Focus groups */}
          <div className="mt-4 flex flex-col gap-5">
            {TASK_GROUPS.map((g) => {
              const groupTasks = mine.filter((t) => groupOf(t) === g.key);
              if (groupTasks.length === 0) return null;
              return (
                <div key={g.key}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[16px]">{g.icon}</span>
                    <span className="text-[13.5px] font-bold">{g.label}</span>
                    <span className="text-[12px] text-faint font-semibold">{groupTasks.length}</span>
                  </div>
                  {viewMode === "cards" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {groupTasks.map((t) => <TaskCard key={t.id} t={t} status={statusOf(t)} onOpen={() => setDrawerId(t.id)} onDone={() => markDone(t.id)} />)}
                    </div>
                  ) : (
                    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
                      {groupTasks.map((t) => <TaskRow key={t.id} t={t} status={statusOf(t)} onOpen={() => setDrawerId(t.id)} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <TeamView doneIds={doneIds} tasks={tasks} onPick={(p) => { setViewAs(p); setTab("myDay"); }} />
      )}

      {drawerTask && <TaskDrawer t={drawerTask} status={statusOf(drawerTask)} onClose={() => setDrawerId(null)} onDone={() => markDone(drawerTask.id)} onReassign={(to) => reassign(drawerTask.id, to)} />}
      {newOpen && <NewTaskModal owner={viewAs} nextId={Math.max(...tasks.map((t) => t.id)) + 1} onClose={() => setNewOpen(false)} onCreate={createTask} />}
      {celebration && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-panel text-white text-[13.5px] font-bold px-5 py-3 rounded-pill shadow-2xl">
          {celebration}
        </div>
      )}
    </>
  );
}

function TypeBadge({ t }: { t: Task }) {
  return <StatusBadge tone={TYPE_TONE[t.type] ?? "neutral"}>{t.moduleIcon} {t.type}</StatusBadge>;
}

function TaskCard({ t, status, onOpen, onDone }: { t: Task; status: string; onOpen: () => void; onDone: () => void }) {
  const done = status === "Done";
  return (
    <div className="bg-surface border border-line rounded-cardLg p-4 flex flex-col gap-2" style={{ opacity: done ? 0.6 : 1 }}>
      <div className="flex items-center justify-between gap-2">
        <TypeBadge t={t} />
        <StatusBadge tone={STATUS_TONE[status] ?? "neutral"}>{status}</StatusBadge>
      </div>
      <button onClick={onOpen} className="text-left">
        <div className="text-[14px] font-bold text-ink leading-tight">{t.title}</div>
        <div className="text-[11.5px] text-faint mt-1">{t.brand} · {t.campaign} · Due {t.due}</div>
      </button>
      {!done && <div className="text-[12px] text-muted leading-[1.4]">{t.nextAction}</div>}
      {t.blocker && <div className="text-[11.5px] font-semibold text-status-red">⚠ Blocked by {t.blocker}</div>}
      <div className="flex items-center gap-2 mt-1">
        {!done && <button onClick={onDone} className="text-[11.5px] font-bold text-white bg-status-green rounded-[8px] px-3 py-[6px]">✓ Mark done</button>}
        <button onClick={onOpen} className="text-[11.5px] font-bold text-muted border border-line2 rounded-[8px] px-3 py-[6px]">{t.status === "Need Approval" ? "Review" : "Open"}</button>
      </div>
    </div>
  );
}

function TaskRow({ t, status, onOpen }: { t: Task; status: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="w-full grid grid-cols-[1.4fr_2fr_1fr_0.8fr_1fr] gap-3 items-center px-5 py-3 text-left border-b border-line4 last:border-0 hover:bg-ivory/60">
      <TypeBadge t={t} />
      <div className="min-w-0"><div className="text-[13px] font-semibold truncate">{t.title}</div><div className="text-[11px] text-faint truncate">{t.brand} · {t.campaign}</div></div>
      <span className="text-[12px] text-muted">{t.assignee}</span>
      <span className="text-[12px] text-muted">{t.due}</span>
      <StatusBadge tone={STATUS_TONE[status] ?? "neutral"}>{status}</StatusBadge>
    </button>
  );
}

function TeamView({ doneIds, tasks, onPick }: { doneIds: Set<number>; tasks: Task[]; onPick: (p: string) => void }) {
  const people = teamSummary(doneIds, tasks);
  const needHelp = people.filter((p) => p.needsAttention);
  return (
    <div className="mt-4 flex flex-col gap-5">
      {needHelp.length > 0 && (
        <div className="bg-status-goldBg border border-accent-border rounded-cardLg p-4">
          <div className="text-[12px] font-bold text-status-gold mb-2">🛟 Needs support today · {needHelp.length}</div>
          <div className="text-[12.5px] text-muted">{needHelp.map((p) => p.name.split(" ")[0]).join(", ")} — consider rebalancing or following up on blockers.</div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {people.map((p) => (
          <button key={p.name} onClick={() => onPick(p.name)} className="text-left bg-surface border border-line rounded-cardLg p-5 hover:border-accent transition">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-extrabold text-white" style={{ background: p.color }}>{p.name.split(" ").map((w) => w[0]).join("")}</span>
              <div>
                <div className="text-[14px] font-bold">{p.name}</div>
                <div className="text-[11px] text-faint">{p.role}</div>
              </div>
              {p.needsAttention && <StatusBadge tone="gold" className="ml-auto">Needs support</StatusBadge>}
              {!p.needsAttention && <StatusBadge tone="green" className="ml-auto">Healthy</StatusBadge>}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[["Done", p.done, "#4E7A4E"], ["Active", p.active, "#3E5C9A"], ["Waiting", p.waiting, "#C68A1E"], ["Stuck", p.stuck, p.stuck ? "#B33A2E" : "#9A9387"]].map(([l, v, c]) => (
                <div key={l as string} className="bg-ivory border border-line3 rounded-card p-2 text-center">
                  <div className="text-[16px] font-extrabold" style={{ color: c as string }}>{v as number}</div>
                  <div className="text-[9.5px] text-faint font-bold uppercase tracking-[0.03em] mt-[1px]">{l as string}</div>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TaskDrawer({ t, status, onClose, onDone, onReassign }: { t: Task; status: string; onClose: () => void; onDone: () => void; onReassign: (to: string) => void }) {
  const done = status === "Done";
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-[480px] bg-surface flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-2" style={{ background: "#FBF9F4" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-[6px] flex-wrap"><TypeBadge t={t} /><StatusBadge tone={STATUS_TONE[status] ?? "neutral"}>{status}</StatusBadge><StatusBadge tone={PRIORITY_TONE[t.priority]}>{t.priority}</StatusBadge></div>
            <div className="text-[16px] font-extrabold leading-tight">{t.title}</div>
            <div className="text-[12px] text-faint mt-1">{t.brand} · {t.campaign} · Due {t.due}</div>
          </div>
          <button onClick={onClose} className="text-faint hover:text-ink flex-shrink-0"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <div className="rounded-card px-4 py-3 bg-accent-soft border border-accent-border">
            <div className="text-[11px] font-bold text-status-gold mb-1">What to do next</div>
            <div className="text-[13px] text-ink">{t.nextAction}</div>
          </div>
          {t.blocker && (
            <div className="rounded-card px-4 py-3" style={{ background: "#FFF5F4", border: "1px solid #F5C8C4" }}>
              <div className="text-[11px] font-bold text-status-red mb-1">Stuck</div>
              <div className="text-[13px] text-status-red font-semibold">⚠ Blocked by {t.blocker}</div>
            </div>
          )}
          {t.checklist.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-[0.05em] text-faint font-bold mb-2">Checklist</div>
              <div className="flex flex-col gap-2">
                {t.checklist.map((c, i) => (
                  <div key={i} className="flex items-center gap-[9px] px-4 py-[10px] rounded-card" style={{ background: "#F7F4EE" }}>
                    <span className="text-[13px]">{done ? "✅" : "⬜"}</span>
                    <span className="text-[12.5px]" style={{ color: done ? "#4E7A4E" : "#211F1C" }}>{c}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {[["Owner", t.assignee], ["Module", t.module], ["Pending approver", t.pendingApprover ?? "—"], ["Priority", t.priority]].map(([l, v]) => (
              <div key={l as string}><div className="text-[10.5px] uppercase tracking-[0.05em] text-faint font-bold mb-[3px]">{l as string}</div><div className="text-[13px] text-ink">{v as string}</div></div>
            ))}
          </div>

          {/* Hand off / reassign */}
          <div className="rounded-card px-4 py-3 bg-ivory border border-line3">
            <div className="text-[11px] uppercase tracking-[0.05em] text-faint font-bold mb-2">Hand off to</div>
            <div className="flex flex-wrap gap-2">
              {PEOPLE.map((p) => {
                const active = p === t.assignee;
                return (
                  <button key={p} onClick={() => onReassign(p)} disabled={active}
                    className="flex items-center gap-[6px] text-[12px] px-[11px] py-[6px] rounded-pill transition disabled:cursor-default"
                    style={active ? { fontWeight: 700, background: "#211F1C", color: "#fff" } : { fontWeight: 500, border: "1px solid #E5DECF", color: "#6b6258", background: "#fff" }}>
                    <span className="w-[16px] h-[16px] rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: PERSON_COLOR[p] }}>{p.split(" ").map((w) => w[0]).join("")}</span>
                    {p.split(" ")[0]}{active ? " · current" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-line flex gap-2">
          {!done ? (
            <>
              <button onClick={onDone} className="flex-1 text-[13px] font-bold text-white bg-status-green rounded-[10px] py-[11px]">✓ Mark done</button>
              <button className="text-[13px] font-semibold text-muted border border-line2 rounded-[10px] px-4">Ask for help</button>
            </>
          ) : (
            <div className="flex-1 text-center text-[13px] font-bold text-status-green py-[11px]">🌿 Completed — nice work</div>
          )}
        </div>
      </div>
    </div>
  );
}

const TYPE_META: Record<string, { module: string; icon: string; color: string }> = {
  Content: { module: "Content", icon: "✍️", color: "#3E5C9A" },
  KOL: { module: "KOL", icon: "🌟", color: "#B5577E" },
  Graphic: { module: "Graphic", icon: "🎨", color: "#C2691E" },
  Budget: { module: "Finance", icon: "฿", color: "#4E7A4E" },
  Ads: { module: "Ads", icon: "📣", color: "#C68A1E" },
  Report: { module: "Campaign", icon: "🎯", color: "#B33A2E" },
  Campaign: { module: "Campaign", icon: "🎯", color: "#B8945A" },
};

function NewTaskModal({ owner, nextId, onClose, onCreate }: { owner: string; nextId: number; onClose: () => void; onCreate: (t: Task) => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Content");
  const [assignee, setAssignee] = useState(owner);
  const [brand, setBrand] = useState("Teppen");
  const [campaign, setCampaign] = useState("");
  const [due, setDue] = useState("Jul 5");
  const [priority, setPriority] = useState<"High" | "Med" | "Low">("Med");
  const [group, setGroup] = useState("doFirst");
  const [nextAction, setNextAction] = useState("");

  const field = "w-full text-[14px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
  const create = () => {
    if (!title.trim()) return;
    const meta = TYPE_META[type];
    onCreate({
      id: nextId, title: title.trim(), module: meta.module, moduleIcon: meta.icon, moduleColor: meta.color,
      type, assignee, brand, campaign: campaign.trim() || "—", status: "Todo", priority, group,
      due, blocker: null, pendingApprover: null, isQuickWin: group === "quickWins",
      nextAction: nextAction.trim() || "Start when you're ready.", checklist: [],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface rounded-cardLg w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-faint hover:text-ink"><X size={18} /></button>
        <div className="text-[16px] font-extrabold mb-4">New Task</div>
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Task Title <span className="text-status-red">*</span></label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="e.g. Draft Wagyu launch caption" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className={field}>
                {Object.keys(TYPE_META).map((t) => <option key={t} value={t}>{TYPE_META[t].icon} {t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Assign to</label>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={field}>
                {PEOPLE.map((p) => <option key={p} value={p}>{p}{p === owner ? " (me)" : ""}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label>
              <select value={brand} onChange={(e) => setBrand(e.target.value)} className={field}><option>Teppen</option><option>Omakase</option><option>Mainichi</option><option>Touka</option></select>
            </div>
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Campaign</label>
              <input value={campaign} onChange={(e) => setCampaign(e.target.value)} className={field} placeholder="e.g. Wagyu Festival" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Due</label>
              <input value={due} onChange={(e) => setDue(e.target.value)} className={field} placeholder="Jul 5" />
            </div>
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as "High" | "Med" | "Low")} className={field}><option>High</option><option>Med</option><option>Low</option></select>
            </div>
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Focus group</label>
              <select value={group} onChange={(e) => setGroup(e.target.value)} className={field}>
                {TASK_GROUPS.filter((g) => g.key !== "done").map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Next action</label>
            <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} className={field} placeholder="One clear next step…" />
          </div>
        </div>
        <button onClick={create} disabled={!title.trim()} className="w-full mt-5 text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40">Create Task</button>
      </div>
    </div>
  );
}
