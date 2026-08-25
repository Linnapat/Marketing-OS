"use client";

import {
  Graphic, briefFields, creativeBriefDetails, stageTone,
  deliverableProgress, deriveDeliverables, productionBlockers, productionSteps,
} from "@/lib/data/graphic";
import { stamp } from "@/lib/format";
import { StatusBadge } from "@/components/ui/StatusBadge";

/* The brief, where the work is.
 *
 * A designer's My Tasks row for a graphic request carries a "Review brief"
 * checklist item and nowhere to review it — the brief lived only on /graphic,
 * so the first thing every job asked for was a page change and a hunt through
 * forty-odd rows for your own request. This is the summary at a glance; the
 * button opens the real GraphicDrawer over this page, so filling the brief,
 * submitting assets and answering feedback all happen without leaving My
 * Tasks. */

const briefPct = (g: Graphic) => {
  const f = briefFields(g);
  return Math.round((f.filter((b) => b.ok).length / f.length) * 100);
};

const DEL_TONE: Record<string, [string, string]> = {
  Approved: ["#4E7A4E", "#EEF4EE"],
  "Waiting review": ["#C68A1E", "#FBF8EE"],
  Revision: ["#C2691E", "#FBF1E9"],
  "Not submitted": ["#9A9387", "#F2F0EB"],
};

const STEP_MARK: Record<string, { icon: string; color: string }> = {
  done: { icon: "✓", color: "#4E7A4E" },
  active: { icon: "●", color: "#C68A1E" },
  waiting: { icon: "○", color: "#9A9387" },
  skipped: { icon: "–", color: "#9A9387" },
};

/** The graphic brief for a My Tasks row linked to a request, plus the way in
 *  to the editable request drawer. */
export function TaskGraphicBrief({ g, onOpenFull }: { g: Graphic; onOpenFull: () => void }) {
  const details = creativeBriefDetails(g);
  const pct = briefPct(g);
  const dels = g.deliverables?.length ? g.deliverables : deriveDeliverables(g);
  const prog = deliverableProgress({ ...g, deliverables: dels });
  const blockers = productionBlockers(g);
  const steps = productionSteps(g);

  return (
    <div className="rounded-[14px] overflow-hidden mb-[14px]" style={{ border: "1px solid #F0D5BC" }}>
      <div className="flex items-center justify-between gap-2 px-[14px] py-[11px]" style={{ background: "#FBF1E9" }}>
        <div className="min-w-0">
          <div className="text-[10px] tracking-[0.08em] uppercase font-bold" style={{ color: "#C2691E" }}>
            🎨 Graphic Brief · #{g.id}
          </div>
          <div className="text-[12.5px] font-bold text-ink truncate mt-[2px]">{g.title}</div>
        </div>
        <div className="flex items-center gap-[6px] flex-shrink-0">
          <StatusBadge tone={stageTone(g.stage)}>{g.stage}</StatusBadge>
        </div>
      </div>

      <div className="px-[14px] py-3 bg-white">
        {/* Completeness first: a brief at 38% is the reason a job stalls, and the
            designer is the one who finds out. */}
        <div className="flex items-center gap-2 mb-[10px]">
          <span className="text-[11px] font-semibold text-faint">ความครบของบรีฟ</span>
          <div className="flex-1 h-[5px] rounded-[3px] overflow-hidden" style={{ background: "#F0EDE6" }}>
            <div className="h-[5px] rounded-[3px]" style={{ width: `${pct}%`, background: pct === 100 ? "#4E7A4E" : pct >= 60 ? "#C68A1E" : "#B33A2E" }} />
          </div>
          <span className="text-[11px] font-bold" style={{ color: pct === 100 ? "#4E7A4E" : pct >= 60 ? "#C68A1E" : "#B33A2E" }}>{pct}%</span>
        </div>

        {g.briefApprovedBy ? (
          <div className="text-[11px] font-bold rounded-[8px] px-[9px] py-[6px] mb-[10px]" style={{ background: "#EEF4EE", color: "#4E7A4E", border: "1px solid #CFE4C2" }}>
            ✓ บรีฟอนุมัติแล้วโดย {g.briefApprovedBy}{stamp(g.briefApprovedAt) ? ` · ${stamp(g.briefApprovedAt)}` : ""}
          </div>
        ) : (
          <div className="text-[11px] font-bold rounded-[8px] px-[9px] py-[6px] mb-[10px]" style={{ background: "#FBF8EE", color: "#8A6D1E", border: "1px solid #EAD9A8" }}>
            ⏳ บรีฟยังไม่ได้ sign-off จากสาย Content
          </div>
        )}

        {/* What is actually stopping the asset submission, in the request's own
            words — the same list the Submit button is gated on. */}
        {blockers.length > 0 && (
          <div className="rounded-[8px] px-[9px] py-[6px] mb-[10px]" style={{ background: "#FFF5F4", border: "1px solid #F5C8C4" }}>
            <div className="text-[10px] font-bold tracking-[0.05em] uppercase mb-[3px]" style={{ color: "#B33A2E" }}>⚠ ยังส่งงานไม่ได้</div>
            {blockers.map((b) => (
              <div key={b} className="text-[11.5px] font-semibold" style={{ color: "#B33A2E" }}>· {b}</div>
            ))}
          </div>
        )}

        {/* Production steps — only worth the room when there is more than the
            artwork step itself (a reel that needs a storyboard and a shoot). */}
        {steps.length > 1 && (
          <div className="mb-[10px]">
            <div className="text-[10px] tracking-[0.08em] uppercase font-bold text-faint mb-[6px]">ขั้นตอนงาน</div>
            {steps.map((s) => {
              const mark = STEP_MARK[s.state] ?? STEP_MARK.waiting;
              return (
                <div key={s.key} className="flex items-start gap-2 py-[3px]">
                  <span className="text-[11px] font-bold flex-shrink-0 w-[12px]" style={{ color: mark.color }}>{mark.icon}</span>
                  <div className="min-w-0">
                    <span className="text-[11.5px] font-bold text-ink">{s.label}</span>
                    <span className="text-[11px] text-faint"> · {s.role} · {s.owner}</span>
                    <div className="text-[11px] text-muted">{s.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-[10px] tracking-[0.08em] uppercase font-bold text-faint mb-[7px]">Creative Brief Pack</div>
        <div className="flex flex-col gap-[6px]">
          {details.map((item) => (
            <div key={item.label} className="rounded-[10px] px-[11px] py-[8px]" style={{ background: "#FAF8F4", border: "1px solid #F0EDE6" }}>
              <div className="text-[10px] uppercase tracking-[0.05em] text-faint font-bold mb-[3px]">{item.label}</div>
              {item.href ? (
                <a href={item.href} target="_blank" rel="noreferrer" className="text-[12px] font-bold text-accent leading-[1.45] break-words">
                  {item.value} ↗
                </a>
              ) : (
                <div className="text-[12px] text-muted leading-[1.45] break-words whitespace-pre-wrap">{item.value}</div>
              )}
            </div>
          ))}
        </div>

        {dels.length > 0 && (
          <>
            <div className="text-[10px] tracking-[0.08em] uppercase font-bold text-faint mt-[13px] mb-[7px]">
              ชิ้นงานที่ต้องส่ง · {prog.approved}/{prog.total} อนุมัติแล้ว
            </div>
            <div className="flex flex-col gap-[5px]">
              {dels.map((d, i) => {
                const [fg, bg] = DEL_TONE[d.status] ?? ["#6b6258", "#F0EDE6"];
                return (
                  <div key={`${d.platform}-${d.size}-${i}`} className="flex items-center justify-between gap-2 rounded-[9px] px-[10px] py-[7px]" style={{ background: "#FAF8F4" }}>
                    <span className="text-[11.5px] text-ink truncate">
                      <b>{d.platform}</b> · {d.size}
                      {d.artworkNo ? <span className="text-faint"> · AW{d.artworkNo}</span> : null}
                    </span>
                    <span className="text-[10px] font-bold px-[7px] py-[2px] rounded-pill flex-shrink-0" style={{ background: bg, color: fg }}>{d.status}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <button onClick={onOpenFull}
          className="block w-full text-center text-[12px] font-bold text-white rounded-[9px] py-[9px] mt-[13px]" style={{ background: "#C2691E" }}>
          เปิด Graphic Request เต็ม · เติมบรีฟ / ส่งไฟล์ / feedback
        </button>
      </div>
    </div>
  );
}

/** One-line brief teaser for the task card — the key message if the brief has
 *  one, otherwise a prompt to open it.
 *
 *  `complete` is the request's own briefComplete flag and nothing else. An
 *  earlier version inferred it from "did this request write a key message",
 *  which contradicted the drawer: request #3 carries briefComplete and no
 *  keyMessage, so the card said "ยังไม่ครบ" over a brief the panel behind it
 *  scored 100%. One flag, one answer. */
export function graphicBriefTeaser(g: Graphic): { text: string; complete: boolean } {
  const msg = g.keyMessage?.trim() || g.objective?.trim();
  return {
    complete: g.briefComplete,
    text: msg || (g.briefComplete ? "บรีฟพร้อมแล้ว — เปิดดูรายละเอียด" : "บรีฟยังไม่ครบ — เปิดดูว่าขาดอะไร"),
  };
}
