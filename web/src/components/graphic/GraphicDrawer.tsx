"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  Graphic, GraphicDeliverable, FEEDBACK, stageTone, PRIORITY_TONE, briefFields,
  deliverableProgress, stageFromDeliverables, deriveDeliverables,
} from "@/lib/data/graphic";
import { brandName, brandColor } from "@/lib/brands";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Progress } from "@/components/ui/Progress";
import { updateGraphic, syncApprovedAssetsToContent } from "@/lib/db/graphic";
import { useAuth } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { OwnerSelect } from "@/components/ui/OwnerSelect";

const TABS = [["overview", "Overview"], ["brief", "Brief"], ["assets", "Assets"], ["feedback", "Feedback"], ["approval", "Approval"], ["delivery", "Delivery"]] as const;
type GTab = (typeof TABS)[number][0];

export function GraphicDrawer({ g: initialGraphic, initialTab = "overview", onClose, onUpdate }: { g: Graphic; initialTab?: GTab; onClose: () => void; onUpdate?: (g: Graphic) => void }) {
  const [g, setGraphic] = useState(initialGraphic);
  const [tab, setTab] = useState<GTab>(initialTab);
  const [feedback, setFeedback] = useState(() => FEEDBACK.filter((f) => f.gid === g.id));
  const [feedbackTarget, setFeedbackTarget] = useState(0);
  const [feedbackReason, setFeedbackReason] = useState("");
  const { member, user } = useAuth();
  const currentUser = member?.name ?? user?.email ?? g.designer;
  const openFb = feedback.filter((f) => f.status === "Open").length;
  const brief = briefFields(g);
  const briefPct = Math.round((brief.filter((b) => b.ok).length / brief.length) * 100);
  const canDeliver = g.stage === "Approved";
  const deliverables = g.deliverables?.length ? g.deliverables : deriveDeliverables(g);
  const reviewableDeliverables = deliverables.filter((d) => d.status === "Waiting review");
  const targetDeliverable = deliverables[feedbackTarget];

  const updateCurrentGraphic = (next: Graphic) => {
    setGraphic(next);
    onUpdate?.(next);
  };

  const markDelivered = () => {
    if (!canDeliver) return;
    const next: Graphic = {
      ...g,
      stage: "Delivered",
      nextAction: "Delivered to campaign / content team",
      history: [...(g.history ?? []), { type: "delivered", at: new Date().toISOString(), by: currentUser }],
    };
    updateGraphic(next); updateCurrentGraphic(next);
  };

  const requestFeedbackRevision = () => {
    const reason = feedbackReason.trim();
    const d = targetDeliverable;
    if (!reason || !d || d.status !== "Waiting review") return;
    const at = new Date().toISOString();
    const nextDeliverables = deliverables.map((x, i) => i === feedbackTarget
      ? { ...x, status: "Revision" as const, feedback: [...x.feedback, { reason, by: currentUser, at }] }
      : x);
    const next: Graphic = {
      ...g,
      deliverables: nextDeliverables,
      stage: stageFromDeliverables({ ...g, deliverables: nextDeliverables }),
      openFb: (g.openFb ?? 0) + 1,
      fb: (g.fb ?? 0) + 1,
      blocker: "Design revision needed",
      nextAction: `${g.designer} to revise ${d.platform} per feedback`,
      history: [...(g.history ?? []), { type: "revision_requested", at, by: currentUser, deliverableKey: `${d.platform}::${d.size}`, note: reason }],
    };
    updateGraphic(next);
    updateCurrentGraphic(next);
    setFeedback((fs) => [{
      id: Date.now(),
      gid: g.id,
      owner: currentUser,
      team: "Requester / Approver",
      ownerColor: "#B5577E",
      type: "Design revision",
      text: reason,
      version: `V${d.version || 1}`,
      status: "Open",
      assignedTo: g.designer,
      due: g.due,
      createdAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    }, ...fs]);
    notify("rejected", `✏️ งานกราฟฟิกถูกส่งกลับแก้: ${g.title}`, `${d.platform} — ${reason} · โดย ${currentUser}`, "/graphic");
    setFeedbackReason("");
    setTab("feedback");
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-[540px] bg-surface flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-2 flex-shrink-0" style={{ background: "#FBF9F4" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-[5px] flex-wrap">
              <span className="text-[15px] font-extrabold">{g.title}</span>
              <StatusBadge tone={PRIORITY_TONE[g.priority]}>{g.priority}</StatusBadge>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[12px] text-muted">
              <span className="flex items-center gap-[5px]"><span className="w-[7px] h-[7px] rounded-full" style={{ background: brandColor(g.b) }} />{brandName(g.b)}</span>
              <span className="text-faint">·</span><span>{g.type}</span>
              <span className="text-faint">·</span><span>Due {g.due}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-faint hover:text-ink flex-shrink-0"><X size={18} /></button>
        </div>

        <div className="flex border-b border-line flex-shrink-0 overflow-x-auto bg-surface">
          {TABS.map(([id, label]) => {
            const active = id === tab;
            return (
              <button key={id} onClick={() => setTab(id)} className="text-[12.5px] font-semibold px-[13px] py-[11px] whitespace-nowrap border-b-2 -mb-[1px] flex items-center gap-[6px]"
                style={active ? { color: "#211F1C", borderColor: "#B8945A" } : { color: "#9A9387", borderColor: "transparent" }}>
                {label}
                {id === "feedback" && openFb > 0 && <span className="text-[9.5px] font-bold px-[6px] rounded-pill bg-status-red text-white">{openFb}</span>}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-[18px]">
          {tab === "overview" && (
            <div className="flex flex-col gap-4">
              <div>
                <div className="text-[10.5px] uppercase tracking-[0.05em] text-faint font-bold mb-[5px]">Assigned Designer</div>
                <OwnerSelect
                  value={g.designer === "Unassigned" ? "" : g.designer}
                  onChange={(name) => {
                    const assigned = name || "Unassigned";
                    const ng: Graphic = {
                      ...g,
                      designer: assigned,
                      nextAction: assigned === "Unassigned" ? "Assign designer to start work" : `${assigned} to start design`,
                      history: [...(g.history ?? []), { type: "assigned", at: new Date().toISOString(), by: currentUser, note: assigned }],
                    };
                    updateGraphic(ng); onUpdate?.(ng);
                  }}
                  team="Creative"
                  placeholder="Unassigned"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[["Stage", <StatusBadge key="s" tone={stageTone(g.stage)}>{g.stage}</StatusBadge>],
                  ["Requester", g.requester], ["Approver", g.approver],
                  ["Platform", g.platform], ["Size", g.size]].map(([l, v], i) => (
                  <div key={i}>
                    <div className="text-[10.5px] uppercase tracking-[0.05em] text-faint font-bold mb-[3px]">{l as string}</div>
                    {typeof v === "string" ? <div className="text-[13px] text-ink">{v}</div> : v}
                  </div>
                ))}
              </div>
              {g.blocker && (
                <div className="rounded-card px-4 py-3" style={{ background: "#FBF3F1", border: "1px solid #E8C5BC" }}>
                  <div className="text-[11px] font-bold text-status-red mb-1">Current blocker · waiting since {g.waitingSince}</div>
                  <div className="text-[12.5px] text-status-red font-semibold">{g.blocker}</div>
                </div>
              )}
              <div className="rounded-card px-4 py-3 bg-accent-soft border border-accent-border">
                <div className="text-[11px] font-bold text-status-gold mb-1">Next action</div>
                <div className="text-[12.5px] text-muted font-semibold">{g.nextAction}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.05em] text-faint font-bold mb-2">Linked Modules</div>
                <div className="flex flex-col gap-2">
                  {[{ icon: "📣", label: "Campaign", sub: g.campaign, tone: "green" as const, status: "Active" },
                    { icon: "📝", label: "Content Calendar", sub: g.contentItem !== "—" ? g.contentItem : "Not linked", tone: g.contentItem !== "—" ? "green" as const : "neutral" as const, status: g.contentItem !== "—" ? "Linked" : "—" },
                    { icon: "💰", label: "Finance / Budget", sub: "Budget request linked", tone: "green" as const, status: "Approved" }].map((m) => (
                    <div key={m.label} className="flex items-center gap-3 p-3 rounded-card bg-ivory border border-line3">
                      <span className="text-[14px]">{m.icon}</span>
                      <div className="flex-1 min-w-0"><div className="text-[13px] font-bold">{m.label}</div><div className="text-[11px] text-faint truncate">{m.sub}</div></div>
                      <StatusBadge tone={m.tone}>{m.status}</StatusBadge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "brief" && (
            <div className="flex flex-col gap-4">
              <div className="rounded-card p-4" style={{ background: "#F7F4EE" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-bold">Brief completeness</span>
                  <StatusBadge tone={briefPct === 100 ? "green" : briefPct >= 60 ? "gold" : "red"}>{briefPct}%</StatusBadge>
                </div>
                <Progress value={briefPct} color={briefPct === 100 ? "#4E7A4E" : "#C68A1E"} />
              </div>
              <div className="flex flex-col gap-2">
                {brief.map((b) => (
                  <div key={b.label} className="flex items-center justify-between px-4 py-[10px] rounded-card bg-surface border border-line3">
                    <span className="text-[13px] text-ink">{b.label}</span>
                    <span className="text-[14px] font-bold" style={{ color: b.ok ? "#4E7A4E" : "#9A9387" }}>{b.ok ? "✓" : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "assets" && <DeliverablesEditor g={g} me={currentUser} onUpdate={updateCurrentGraphic} />}

          {tab === "feedback" && (
            <div className="flex flex-col gap-3">
              <div className="rounded-card border border-line bg-ivory p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="text-[13px] font-extrabold text-ink">Give feedback / Request revision</div>
                    <div className="text-[11.5px] text-faint mt-1">
                      ใช้เมื่อ Designer หรือ Agency ส่ง asset มาแล้ว สถานะเป็น Waiting review
                    </div>
                  </div>
                  <StatusBadge tone={reviewableDeliverables.length ? "gold" : "neutral"}>
                    {reviewableDeliverables.length ? `${reviewableDeliverables.length} waiting review` : "No asset to review"}
                  </StatusBadge>
                </div>
                <div className="flex flex-col gap-2">
                  <select
                    value={feedbackTarget}
                    onChange={(e) => setFeedbackTarget(Number(e.target.value))}
                    className="w-full text-[12.5px] px-[10px] py-[9px] rounded-[9px] border border-line2 bg-surface outline-none"
                  >
                    {deliverables.map((d, i) => (
                      <option key={`${d.platform}-${d.size}`} value={i}>
                        {d.platform} · {d.size} — {d.status}
                      </option>
                    ))}
                  </select>
                  {targetDeliverable?.status !== "Waiting review" && (
                    <div className="text-[11.5px] rounded-[8px] px-3 py-2 bg-accent-soft text-faint border border-accent-border">
                      Asset นี้ยัง feedback ไม่ได้ เพราะยังไม่ได้ส่งมาให้ review — ให้ Designer/Agency ใส่ลิงก์แล้วกด Submit for Review ก่อน
                    </div>
                  )}
                  <textarea
                    value={feedbackReason}
                    onChange={(e) => setFeedbackReason(e.target.value)}
                    rows={3}
                    placeholder="พิมพ์ feedback / จุดที่ต้องแก้ เช่น logo ใหญ่ขึ้น, เปลี่ยนรูป, copy ไม่ตรง brief..."
                    className="w-full text-[12.5px] px-[10px] py-[9px] rounded-[9px] border border-line2 bg-surface outline-none resize-none"
                  />
                  <button
                    onClick={requestFeedbackRevision}
                    disabled={!feedbackReason.trim() || targetDeliverable?.status !== "Waiting review"}
                    className="self-start text-[12px] font-bold text-white rounded-[9px] px-4 py-[8px] disabled:opacity-40"
                    style={{ background: "#C67A28" }}
                  >
                    ↩ Send Feedback / Request Revision
                  </button>
                </div>
              </div>
              {feedback.length === 0 && <div className="text-[13px] text-faint text-center py-6">No feedback history yet.</div>}
              {feedback.map((f) => (
                <div key={f.id} className="bg-surface border border-line rounded-card p-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: f.ownerColor }}>{f.owner.slice(0, 1)}</span>
                    <span className="text-[12.5px] font-bold">{f.owner}</span>
                    <span className="text-[10.5px] text-faint">{f.team} · {f.createdAt}</span>
                    <StatusBadge tone={stageTone(f.status)} className="ml-auto">{f.status}</StatusBadge>
                  </div>
                  <div className="text-[12.5px] text-muted leading-[1.5]">{f.text}</div>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-faint">
                    <span className="px-[7px] py-[1px] rounded-pill bg-ivory border border-line3">{f.type}</span>
                    <span>{f.version}</span><span>→ {f.assignedTo}</span>
                    {f.status === "Open" && <button onClick={() => setFeedback((fs) => fs.map((x) => x.id === f.id ? { ...x, status: "Resolved" } : x))} className="ml-auto text-[11px] font-bold text-status-green">Resolve ✓</button>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "approval" && (
            <div className="flex flex-col gap-3">
              {[["Designer submitted", "green", g.designer], ["Requester reviewed", g.openFb > 0 ? "gold" : "green", g.requester], ["Marketing Manager / BGL approval", g.stage === "Approved" || g.stage === "Delivered" ? "green" : "neutral", "Mei T."], ["CMO approval", g.stage === "Delivered" ? "green" : g.pendingApprover === g.approver ? "gold" : "neutral", g.approver]].map(([role, tone, person], i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-line4 last:border-0">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: tone === "green" ? "#4E7A4E" : tone === "gold" ? "#C68A1E" : "#C0B8AD" }}>{i + 1}</div>
                  <div className="flex-1"><div className="text-[13px] font-bold">{role as string}</div><div className="text-[11.5px] text-faint">{person as string}</div></div>
                  <StatusBadge tone={tone as "green" | "gold" | "neutral"}>{tone === "green" ? "Done" : tone === "gold" ? "Pending" : "—"}</StatusBadge>
                </div>
              ))}
            </div>
          )}

          {tab === "delivery" && (
            <div className="flex flex-col gap-2">
              {canDeliver && (
                <button onClick={markDelivered} className="self-start text-[12px] font-bold text-white bg-panel rounded-[8px] px-3 py-[8px] mb-2">
                  Mark Delivered
                </button>
              )}
              {["Final artwork approved", "Correct size exported", "Source file attached", "Final asset link added", "Content Calendar updated", "Campaign status updated", "Delivered date set"].map((label) => {
                const done = g.stage === "Delivered";
                return (
                  <div key={label} className="flex items-center gap-[9px] px-4 py-[10px] rounded-card" style={{ background: "#F7F4EE" }}>
                    <span className="text-[13px]">{done ? "✅" : "⬜"}</span>
                    <span className="text-[12.5px] font-medium" style={{ color: done ? "#4E7A4E" : "#9A9387" }}>{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const DEL_TONE: Record<string, "neutral" | "gold" | "green" | "red"> = {
  "Not submitted": "neutral", "Waiting review": "gold", Revision: "red", Approved: "green",
};

// Deliverable-level board: one row per Platform × Asset Size from the content
// brief. The graphic team pastes a link + source per row and submits it; the
// requester approves or sends it back — each row moves independently.
function DeliverablesEditor({ g, me, onUpdate }: { g: Graphic; me: string; onUpdate?: (g: Graphic) => void }) {
  const [dels, setDels] = useState<GraphicDeliverable[]>(() =>
    g.deliverables?.length ? g.deliverables.map((d) => ({ ...d })) : deriveDeliverables(g));
  const [revising, setRevising] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const prog = deliverableProgress({ ...g, deliverables: dels });

  const persist = (next: GraphicDeliverable[], event?: NonNullable<Graphic["history"]>[number]) => {
    setDels(next);
    const ng: Graphic = { ...g, deliverables: next, history: event ? [...(g.history ?? []), event] : g.history };
    const ready = deliverableProgress(ng).ready;
    ng.stage = stageFromDeliverables(ng);
    ng.blocker = ready ? null : g.blocker;
    ng.nextAction = ready ? "Ready to deploy — attached to Content Calendar" : g.nextAction;
    updateGraphic(ng); onUpdate?.(ng);
    // Fully approved → push approved asset links onto the linked content post.
    if (ready) {
      syncApprovedAssetsToContent(ng).catch(() => {});
      notify("approved", `✅ งานกราฟฟิกอนุมัติครบทุกชิ้น: ${g.title}`, "แนบ asset เข้า Content Calendar ให้แล้ว — พร้อม publish", "/content");
    }
  };
  const patch = (i: number, p: Partial<GraphicDeliverable>) => setDels((ds) => ds.map((d, j) => j === i ? { ...d, ...p } : d));
  const submit = (i: number) => {
    const d = dels[i];
    if (!d.assetLink.trim()) return;
    const at = new Date().toISOString();
    persist(
      dels.map((x, j) => j === i ? { ...x, status: "Waiting review", version: x.version + 1, submittedBy: me, submittedAt: at } : x),
      { type: "submitted", at, by: me, deliverableKey: `${d.platform}::${d.size}` },
    );
    notify("feedback", `🎨 ส่งงานกราฟฟิกรอรีวิว: ${g.title}`, `${d.platform} · ${d.size} · โดย ${me} → รอ ${g.requester} รีวิว`, "/graphic");
  };
  const approve = (i: number) => {
    const at = new Date().toISOString();
    const d = dels[i];
    persist(
      dels.map((x, j) => j === i ? { ...x, status: "Approved" } : x),
      { type: "approved", at, by: me, deliverableKey: `${d.platform}::${d.size}` },
    );
  };
  const sendBack = (i: number) => {
    const r = reason.trim(); if (!r) return;
    const at = new Date().toISOString();
    const d = dels[i];
    persist(
      dels.map((x, j) => j === i ? { ...x, status: "Revision", feedback: [...x.feedback, { reason: r, by: me, at }] } : x),
      { type: "revision_requested", at, by: me, deliverableKey: `${d.platform}::${d.size}`, note: r },
    );
    notify("rejected", `✏️ งานกราฟฟิกถูกส่งกลับแก้: ${g.title}`, `${dels[i]?.platform ?? ""} — ${r} · โดย ${me}`, "/graphic");
    setReason(""); setRevising(null);
  };

  const inp = "w-full text-[12.5px] px-[10px] py-[8px] rounded-[8px] border border-line2 bg-ivory outline-none";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] font-bold text-muted">Deliverables · {dels.length} asset</div>
        <StatusBadge tone={prog.ready ? "green" : "gold"}>{prog.ready ? "Ready to deploy" : `${prog.approved}/${prog.total} approved`}</StatusBadge>
      </div>

      {dels.map((d, i) => {
        const editable = d.status === "Not submitted" || d.status === "Revision";
        const inReview = d.status === "Waiting review";
        return (
          <div key={i} className="bg-surface border border-line rounded-card p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div><span className="text-[13.5px] font-bold">{d.platform}</span> <span className="text-[12px] text-faint">· {d.size}</span></div>
              <div className="flex items-center gap-2">
                {d.version > 0 && <span className="text-[10.5px] font-bold text-faint">v{d.version}</span>}
                <StatusBadge tone={DEL_TONE[d.status] ?? "neutral"}>{d.status}</StatusBadge>
              </div>
            </div>
            {d.refLink && <a href={d.refLink} target="_blank" rel="noreferrer" className="text-[11.5px] text-accent font-semibold">Reference brief ↗</a>}

            {editable ? (
              <div className="flex flex-col gap-2 mt-2">
                {d.status === "Revision" && d.feedback.length > 0 && (
                  <div className="text-[12px] rounded-[8px] px-3 py-2" style={{ background: "#FBECEA", color: "#B33A2E" }}>↩ {d.feedback[d.feedback.length - 1].reason}</div>
                )}
                <input value={d.assetLink} onChange={(e) => patch(i, { assetLink: e.target.value })} className={inp} placeholder="Artwork link (Drive / Figma / PNG) *" />
                <input value={d.sourceLink} onChange={(e) => patch(i, { sourceLink: e.target.value })} className={inp} placeholder="Source file link" />
                <button onClick={() => submit(i)} disabled={!d.assetLink.trim()} className="self-start text-[12px] font-bold text-white rounded-[8px] px-3 py-[7px] disabled:opacity-40" style={{ background: "#211F1C" }}>{d.status === "Revision" ? "Re-submit for Review" : "Submit for Review"}</button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-center gap-3 text-[11.5px]">
                  <a href={d.assetLink} target="_blank" rel="noreferrer" className="text-accent font-semibold">Open artwork ↗</a>
                  {d.sourceLink && <a href={d.sourceLink} target="_blank" rel="noreferrer" className="text-accent font-semibold">Source ↗</a>}
                  <span className="text-faint">by {d.submittedBy}</span>
                </div>
                {inReview && (
                  revising === i ? (
                    <div className="flex flex-col gap-2">
                      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} autoFocus placeholder="เหตุผลที่ต้องแก้…" className="w-full text-[12.5px] px-[10px] py-[8px] rounded-[8px] border border-line2 bg-ivory outline-none resize-none" />
                      <div className="flex gap-2">
                        <button onClick={() => sendBack(i)} disabled={!reason.trim()} className="text-[12px] font-bold text-white rounded-[8px] px-3 py-[7px] disabled:opacity-40" style={{ background: "#C67A28" }}>Send Back</button>
                        <button onClick={() => { setRevising(null); setReason(""); }} className="text-[12px] font-semibold text-muted border border-line2 rounded-[8px] px-3 py-[7px]">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => approve(i)} className="text-[12px] font-bold text-white rounded-[8px] px-3 py-[7px]" style={{ background: "#4E7A4E" }}>✓ Approve</button>
                      <button onClick={() => setRevising(i)} className="text-[12px] font-bold text-status-orange border-[1.5px] border-line2 rounded-[8px] px-3 py-[7px]">↩ Request Revision</button>
                      <span className="self-center text-[11px] text-faint">requester: {g.requester}</span>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
