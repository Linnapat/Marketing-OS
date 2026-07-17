"use client";

// Per-deliverable submit for the Agency Portal — the external mirror of the
// internal Creative Kitchen drawer's Deliverables tab, same shape and wording
// so a request looks the same to whoever opens it.
//
// The portal used to offer ONE link box per request, which landed on the first
// deliverable only (`i === 0`). A request for 1:1 + 4:5 + 9:16 therefore looked
// like a single delivery: the other two stayed "Not submitted", could never be
// approved, and would never be counted or paid. Each piece now has its own link
// and its own submit.
//
// Approval stays internal: the agency submits, the requester approves. So there
// are deliberately no Approve / Request Revision buttons here — only the
// feedback the team sent back.

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Graphic, GraphicDeliverable, deriveDeliverables, deliverableProgress, submitDeliverable,
} from "@/lib/data/graphic";

const DEL_TONE: Record<string, "green" | "gold" | "red" | "neutral"> = {
  Approved: "green",
  "Waiting review": "gold",
  Revision: "red",
  "Not submitted": "neutral",
};

const inp = "w-full text-[12.5px] px-[10px] py-[8px] rounded-[8px] border border-line2 bg-ivory outline-none";

export function AgencyDeliverables({ g, by, onChange }: {
  g: Graphic;
  /** The agency user submitting — recorded as the deliverable's submitter. */
  by: string;
  onChange: (next: Graphic) => void;
}) {
  const [dels, setDels] = useState<GraphicDeliverable[]>(() => (g.deliverables?.length ? g.deliverables : deriveDeliverables(g)));

  // The list is re-derived when the request changes underneath (e.g. the team
  // sent a piece back for revision while the portal was open).
  useEffect(() => {
    setDels(g.deliverables?.length ? g.deliverables : deriveDeliverables(g));
  }, [g]);

  const prog = deliverableProgress({ ...g, deliverables: dels });
  const patch = (i: number, p: Partial<GraphicDeliverable>) => setDels((ds) => ds.map((d, j) => (j === i ? { ...d, ...p } : d)));

  const submit = (i: number) => {
    const next = submitDeliverable({ ...g, deliverables: dels }, i, by);
    if (next) onChange(next);
  };

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-bold text-muted">
          Deliverables · {dels.length} ชิ้น
        </div>
        <StatusBadge tone={prog.ready ? "green" : "gold"}>
          {prog.ready ? "อนุมัติครบแล้ว" : `${prog.approved}/${prog.total} approved`}
        </StatusBadge>
      </div>
      <div className="text-[10.5px] text-faint -mt-1">
        ส่งงานทีละชิ้นตามไซซ์ — แต่ละไซซ์นับเป็นคนละชิ้นงาน
      </div>

      {dels.map((d, i) => {
        const editable = d.status === "Not submitted" || d.status === "Revision";
        const lastFeedback = d.feedback[d.feedback.length - 1];
        return (
          <div key={`${d.platform}::${d.size}::${i}`} className="bg-surface border border-line rounded-card p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <span className="text-[13px] font-bold">{d.platform}</span>{" "}
                <span className="text-[11.5px] text-faint">· {d.size}</span>
              </div>
              <div className="flex items-center gap-2">
                {d.version > 0 && <span className="text-[10.5px] font-bold text-faint">v{d.version}</span>}
                <StatusBadge tone={DEL_TONE[d.status] ?? "neutral"}>{d.status}</StatusBadge>
              </div>
            </div>

            {d.refLink && (
              <a href={d.refLink} target="_blank" rel="noreferrer" className="text-[11.5px] text-accent font-semibold">
                Reference brief ↗
              </a>
            )}

            {editable ? (
              <div className="flex flex-col gap-2 mt-2">
                {d.status === "Revision" && lastFeedback && (
                  <div className="text-[12px] rounded-[8px] px-3 py-2" style={{ background: "#FBECEA", color: "#B33A2E" }}>
                    ↩ {lastFeedback.reason}
                  </div>
                )}
                <input value={d.assetLink} onChange={(e) => patch(i, { assetLink: e.target.value })} className={inp}
                  placeholder="Artwork link (Drive / Canva / Figma) *" />
                <input value={d.sourceLink} onChange={(e) => patch(i, { sourceLink: e.target.value })} className={inp}
                  placeholder="Source file link" />
                <button onClick={() => submit(i)} disabled={!d.assetLink.trim()}
                  className="self-start text-[12px] font-bold text-white rounded-[8px] px-3 py-[7px] disabled:opacity-40"
                  style={{ background: "#211F1C" }}>
                  {d.status === "Revision" ? "Re-submit for Review" : "Submit for Review"}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 mt-2 text-[11.5px]">
                <a href={d.assetLink} target="_blank" rel="noreferrer" className="text-accent font-semibold">Open artwork ↗</a>
                {d.sourceLink && <a href={d.sourceLink} target="_blank" rel="noreferrer" className="text-accent font-semibold">Source ↗</a>}
                <span className="text-faint">
                  {d.status === "Waiting review" ? `รอ ${g.requester} รีวิว` : `by ${d.submittedBy}`}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
