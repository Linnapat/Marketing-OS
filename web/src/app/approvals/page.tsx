"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { Segmented } from "@/components/ui/Segmented";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { BrandFilterValue, brandName } from "@/lib/brands";
import { REQUESTS, RequestRow, APPROVAL_STAGES, STAGE_TONE, PRIORITY_TONE } from "@/lib/data/requests";
import { fetchRequests, updateRequestStage, rejectRequest } from "@/lib/db/requests";
import { useAuth } from "@/lib/auth";
import { X } from "lucide-react";

export default function ApprovalQueuePage() {
  const [view, setView] = useState<"board" | "list">("board");
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [requests, setRequests] = useState<RequestRow[]>(REQUESTS);
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const { member, user } = useAuth();
  const reviewer = member?.name ?? user?.email ?? "CMO";

  useEffect(() => {
    let alive = true;
    fetchRequests().then((r) => { if (alive) setRequests(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Advance is a plain forward move. Backward is a reject and goes through the
  // modal so a reason is captured — see reject() below.
  const advance = (id: string) => {
    setRequests((rs) => rs.map((r) => {
      if (r.id !== id) return r;
      const idx = APPROVAL_STAGES.indexOf(r.stage);
      const stage = APPROVAL_STAGES[Math.min(APPROVAL_STAGES.length - 1, idx + 1)];
      updateRequestStage(id, stage);
      const next = { ...r, stage };
      setSelected((s) => (s && s.id === id ? next : s));
      return next;
    }));
  };

  const reject = (id: string, reason: string) => {
    setRequests((rs) => rs.map((r) => {
      if (r.id !== id) return r;
      const idx = APPROVAL_STAGES.indexOf(r.stage);
      const stage = APPROVAL_STAGES[Math.max(0, idx - 1)];
      const entry = { stage: r.stage, reason, by: reviewer, at: new Date().toISOString() };
      const feedback = [...(r.feedback ?? []), entry];
      rejectRequest(id, stage, feedback);
      const next = { ...r, stage, feedback };
      setSelected((s) => (s && s.id === id ? next : s));
      return next;
    }));
  };

  const rows = requests.filter((r) => brand === "all" || r.b === brand);

  return (
    <>
      <PageHeader eyebrow="Approval Queue" title="Approval Queue" subtitle={`${rows.length} items across the 9-stage pipeline — Draft → Reported`} />

      <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
        <Segmented value={view} onChange={setView} options={[{ value: "board", label: "Board" }, { value: "list", label: "List" }]} />
        <BrandFilter value={brand} onChange={setBrand} />
      </div>

      <div className="mt-5">
        {view === "board" ? (
          <div className="flex gap-3 overflow-x-auto pb-3">
            {APPROVAL_STAGES.map((stage) => {
              const items = rows.filter((r) => r.stage === stage);
              return (
                <div key={stage} className="flex-shrink-0 w-[250px]">
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <StatusBadge tone={STAGE_TONE[stage] ?? "neutral"}>{stage}</StatusBadge>
                    <span className="text-[12px] text-faint font-semibold">{items.length}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {items.map((r) => (
                      <div key={r.id} onClick={() => setSelected(r)} className="bg-surface border border-line rounded-card p-[13px] cursor-pointer hover:border-accent transition">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-[13px] font-bold leading-tight line-clamp-2 min-w-0">{r.typeIcon} {r.title}</span>
                          <StatusBadge tone={PRIORITY_TONE[r.priority]}>{r.priority}</StatusBadge>
                        </div>
                        <div className="text-[11px] text-faint flex items-center gap-[5px] mb-1"><BrandDot brand={r.b} size={6} />{brandName(r.b)} · {r.campaign}</div>
                        <div className="flex items-center justify-between text-[11px] text-faint">
                          <span>{r.requester} → {r.approver}</span><span>{r.due}</span>
                        </div>
                        {r.feedback && r.feedback.length > 0 && <div className="text-[10.5px] font-semibold text-status-orange mt-1">↩ {r.feedback.length} revision note(s)</div>}
                        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-line4" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => setSelected(r)} disabled={APPROVAL_STAGES.indexOf(r.stage) === 0}
                            className="text-[11px] font-bold text-muted border border-line2 rounded-[7px] px-2 py-[3px] bg-white disabled:opacity-30 disabled:cursor-default">← Back</button>
                          <button onClick={() => advance(r.id)} disabled={APPROVAL_STAGES.indexOf(r.stage) === APPROVAL_STAGES.length - 1}
                            className="text-[11px] font-bold text-white bg-panel rounded-[7px] px-2 py-[3px] disabled:opacity-30 disabled:cursor-default ml-auto">Advance →</button>
                        </div>
                      </div>
                    ))}
                    {items.length === 0 && <div className="text-[11px] text-faint text-center py-4 border border-dashed border-line2 rounded-card">Empty</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
            <div className="hidden md:grid px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4" style={{ gridTemplateColumns: "2fr 1.3fr 1fr 1fr 0.7fr 1.1fr" }}>
              <div>Request</div><div>Campaign</div><div>Requester</div><div>Approver</div><div>Due</div><div>Stage</div>
            </div>
            {rows.map((r) => (
              <div key={r.id} onClick={() => setSelected(r)} className="grid grid-cols-1 md:grid-cols-[2fr_1.3fr_1fr_1fr_0.7fr_1.1fr] gap-y-1 items-center px-5 py-3 border-b border-line4 last:border-0 cursor-pointer hover:bg-ivory transition">
                <div><div className="text-[13px] font-bold">{r.typeIcon} {r.title}</div><div className="text-[11px] text-faint flex items-center gap-[5px]"><BrandDot brand={r.b} size={6} />{brandName(r.b)}</div></div>
                <span className="text-[12px] text-muted truncate">{r.campaign}</span>
                <span className="text-[12px] text-muted">{r.requester}</span>
                <span className="text-[12px] text-muted">{r.approver}</span>
                <span className="text-[12px] text-muted">{r.due}</span>
                <div><StatusBadge tone={STAGE_TONE[r.stage] ?? "neutral"}>{r.stage}</StatusBadge></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <ReviewModal
          key={selected.id}
          req={selected}
          onClose={() => setSelected(null)}
          onAdvance={() => advance(selected.id)}
          onReject={(reason) => reject(selected.id, reason)}
        />
      )}
    </>
  );
}

function ReviewModal({ req, onClose, onAdvance, onReject }: {
  req: RequestRow; onClose: () => void; onAdvance: () => void; onReject: (reason: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const stageIdx = APPROVAL_STAGES.indexOf(req.stage);
  const atStart = stageIdx <= 0;
  const atEnd = stageIdx >= APPROVAL_STAGES.length - 1;

  const doReject = () => {
    if (!reason.trim()) return;
    onReject(reason.trim());
    setReason(""); setRejecting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative bg-surface rounded-cardLg w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-faint hover:text-ink"><X size={18} /></button>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[18px]">{req.typeIcon}</span>
          <span className="text-[11px] font-bold px-2 py-[2px] rounded-pill bg-panel text-white">{req.type}</span>
          <StatusBadge tone={PRIORITY_TONE[req.priority]}>{req.priority}</StatusBadge>
        </div>
        <div className="text-[17px] font-extrabold text-ink mb-1">{req.title}</div>
        <div className="text-[12px] text-faint flex items-center gap-[6px] mb-4"><BrandDot brand={req.b} size={7} />{brandName(req.b)} · {req.campaign}</div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {[["Requester", req.requester], ["Approver", req.approver], ["Due", req.due], ["Stage", req.stage]].map(([l, v]) => (
            <div key={l} className="bg-ivory border border-line2 rounded-card px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.05em] text-faint font-bold mb-[2px]">{l}</div>
              <div className="text-[13px] font-semibold text-ink">{v}</div>
            </div>
          ))}
        </div>

        {req.feedback && req.feedback.length > 0 && (
          <div className="mb-4">
            <div className="text-[11.5px] font-bold text-muted mb-2">Revision history</div>
            <div className="flex flex-col gap-2">
              {req.feedback.slice().reverse().map((f, i) => (
                <div key={i} className="rounded-[11px] px-[13px] py-[10px] border-[1.5px]" style={{ borderColor: "#F0D9C0", background: "#FCF6EE" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11.5px] font-bold text-status-orange">Sent back from {f.stage}</span>
                    <span className="text-[11px] text-faint">{f.by} · {new Date(f.at).toLocaleDateString()}</span>
                  </div>
                  <div className="text-[12.5px] text-ink">{f.reason}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {rejecting ? (
          <div className="flex flex-col gap-2">
            <label className="text-[11.5px] font-bold text-muted">Reason for sending back <span className="text-status-red">*</span></label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus
              placeholder="What must the requester fix before this can advance?"
              className="w-full text-[13px] px-[13px] py-[10px] rounded-[10px] border-[1.5px] border-line2 bg-ivory outline-none resize-none" />
            <div className="flex gap-2">
              <button onClick={doReject} disabled={!reason.trim()} className="flex-1 text-[13px] font-bold py-[10px] rounded-[10px] text-white disabled:opacity-40" style={{ background: "#C67A28" }}>Send Back with Reason</button>
              <button onClick={() => { setRejecting(false); setReason(""); }} className="text-[13px] font-semibold py-[10px] px-4 rounded-[10px] border border-line2 text-muted">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setRejecting(true)} disabled={atStart} className="flex-1 text-[13px] font-bold py-[10px] rounded-[10px] border-[1.5px] border-line2 text-status-orange disabled:opacity-40">← Send Back</button>
            <button onClick={onAdvance} disabled={atEnd} className="flex-1 text-[13px] font-bold py-[10px] rounded-[10px] text-white disabled:opacity-40" style={{ background: "#4E7A4E" }}>Advance →</button>
          </div>
        )}
      </div>
    </div>
  );
}
