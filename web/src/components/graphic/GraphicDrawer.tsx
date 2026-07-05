"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  Graphic, FEEDBACK, VERSIONS, stageTone, PRIORITY_TONE, briefFields,
} from "@/lib/data/graphic";
import { brandName, brandColor } from "@/lib/brands";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Progress } from "@/components/ui/Progress";
import { updateGraphic } from "@/lib/db/graphic";
import { useAuth } from "@/lib/auth";

const TABS = [["overview", "Overview"], ["brief", "Brief"], ["assets", "Assets"], ["feedback", "Feedback"], ["approval", "Approval"], ["delivery", "Delivery"]] as const;
type GTab = (typeof TABS)[number][0];

export function GraphicDrawer({ g, initialTab = "overview", onClose, onUpdate }: { g: Graphic; initialTab?: GTab; onClose: () => void; onUpdate?: (g: Graphic) => void }) {
  const [tab, setTab] = useState<GTab>(initialTab);
  const [feedback, setFeedback] = useState(() => FEEDBACK.filter((f) => f.gid === g.id));
  const versions = VERSIONS.filter((v) => v.gid === g.id);
  const { member, user } = useAuth();
  const designer = member?.name ?? user?.email ?? g.designer;
  const openFb = feedback.filter((f) => f.status === "Open").length;
  const brief = briefFields(g);
  const briefPct = Math.round((brief.filter((b) => b.ok).length / brief.length) * 100);

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
              <div className="grid grid-cols-2 gap-3">
                {[["Stage", <StatusBadge key="s" tone={stageTone(g.stage)}>{g.stage}</StatusBadge>],
                  ["Designer", g.designer], ["Requester", g.requester], ["Approver", g.approver],
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

          {tab === "assets" && (
            <div className="flex flex-col gap-3">
              {versions.length === 0 && <div className="text-[13px] text-faint text-center py-8">No versions uploaded yet.</div>}
              {versions.map((v, i) => (
                <div key={i} className="bg-surface border border-line rounded-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-bold">{v.name}</span>
                      {v.isLatest && <StatusBadge tone="blue">Latest</StatusBadge>}
                    </div>
                    <StatusBadge tone={v.approvalStatus === "Approved" ? "green" : v.approvalStatus.includes("Rejected") || v.approvalStatus.includes("revision") ? "red" : "gold"}>{v.approvalStatus}</StatusBadge>
                  </div>
                  <div className="flex items-center gap-4 text-[11.5px] text-faint">
                    <span>Uploaded by {v.uploadedBy}</span><span>{v.uploadedAt}</span>
                    {v.feedbackCount > 0 && <span className="text-status-red font-semibold">💬 {v.feedbackCount}</span>}
                  </div>
                  <div className="flex gap-3 mt-2">
                    <span className="text-[11.5px] text-accent font-semibold cursor-pointer">Open artwork ↗</span>
                    <span className="text-[11.5px] text-accent font-semibold cursor-pointer">Source file ↗</span>
                  </div>
                </div>
              ))}
              <SubmitWork g={g} designer={designer} onUpdate={onUpdate} />
            </div>
          )}

          {tab === "feedback" && (
            <div className="flex flex-col gap-3">
              {feedback.length === 0 && <div className="text-[13px] text-faint text-center py-8">No feedback yet.</div>}
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
              {[["Designer submitted", "green", g.designer], ["Requester reviewed", g.openFb > 0 ? "gold" : "green", g.requester], ["Brand Lead approval", g.stage === "Approved" || g.stage === "Delivered" ? "green" : "neutral", "Mei T."], ["CMO approval", g.stage === "Delivered" ? "green" : g.pendingApprover === g.approver ? "gold" : "neutral", g.approver]].map(([role, tone, person], i) => (
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

// Where the graphic team submits finished work: paste the artwork + source
// links and Submit for Review — advances the stage to "Waiting Feedback" so the
// requester (and then the approver) can review it. Persists to the request.
function SubmitWork({ g, designer, onUpdate }: { g: Graphic; designer: string; onUpdate?: (g: Graphic) => void }) {
  const [link, setLink] = useState(g.deliverableLink ?? "");
  const [source, setSource] = useState(g.sourceLink ?? "");
  const [busy, setBusy] = useState(false);
  const submitted = /Waiting Feedback|Waiting Approval|Approved|Delivered/i.test(g.stage);
  const field = "w-full text-[13px] px-[12px] py-[9px] rounded-[9px] border border-line2 bg-ivory outline-none";

  const submit = async () => {
    if (!link.trim()) return;
    setBusy(true);
    const next: Graphic = {
      ...g,
      deliverableLink: link.trim(), sourceLink: source.trim() || g.sourceLink,
      submittedBy: designer, submittedAt: new Date().toISOString(),
      stage: "Waiting Feedback", blocker: null,
      pendingApprover: g.requester, nextAction: "Requester to review submitted work",
    };
    try { await updateGraphic(next); onUpdate?.(next); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-card border border-line2 p-4" style={{ background: "#FBF9F4" }}>
      <div className="text-[12.5px] font-bold text-ink mb-1">Submit work (graphic team)</div>
      <div className="text-[11.5px] text-faint mb-3">วางลิงก์งานที่ทำเสร็จ แล้วกด Submit for Review — สถานะจะไปที่ “Waiting Feedback” ให้ผู้ขอรีวิว</div>
      <div className="flex flex-col gap-2">
        <div>
          <label className="block text-[11px] font-bold text-faint mb-[4px]">Artwork link <span className="text-status-red">*</span></label>
          <input value={link} onChange={(e) => setLink(e.target.value)} className={field} placeholder="https://… (Drive / Figma / PNG)" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-faint mb-[4px]">Source file link</label>
          <input value={source} onChange={(e) => setSource(e.target.value)} className={field} placeholder="https://… (AI / PSD / Figma)" />
        </div>
        <div className="flex items-center gap-3 mt-1">
          <button onClick={submit} disabled={!link.trim() || busy} className="text-[12.5px] font-bold text-white rounded-[9px] px-4 py-[9px] disabled:opacity-40" style={{ background: "#211F1C" }}>
            {busy ? "Submitting…" : submitted ? "Re-submit for Review" : "Submit for Review"}
          </button>
          {submitted && <span className="text-[12px] font-semibold text-status-green">✓ ส่งแล้ว · {g.submittedBy || designer}</span>}
        </div>
      </div>
    </div>
  );
}
