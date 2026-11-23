"use client";

/* "…" on an approval row: Hold, and Delete.
 *
 * Kept behind a menu and away from "ผ่าน" on purpose — these end or shelve
 * somebody's work, and neither should be one mis-aimed click from the button
 * people press all day. Both ask for a reason; delete asks twice and says
 * exactly what goes. Rules: data/approvalHold. Writes: lib/approvalActions. */

import { useEffect, useState } from "react";
import type { ApprovalRow } from "@/lib/data/approvals";
import {
  DELETE_REASONS, HOLD_REASON_MIN, deleteReasonText, deleteSummary, holdReasonValid, type DeleteReason,
} from "@/lib/data/approvalHold";
import {
  deleteFromQueue, holdFromQueue, resumeFromQueue, isGraphicRow, rowTitle, type QueueActionResult,
} from "@/lib/approvalActions";
import { FinishedFold } from "@/components/ui/FinishedFold";
import { fmtDate } from "@/lib/format";
import { toastError, toastSuccess } from "@/lib/toast";

const field = "w-full text-[13px] px-3 py-2 rounded-[10px] border border-line2 bg-ivory outline-none focus:border-accent";

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative w-full max-w-[460px] bg-surface rounded-cardLg border border-line shadow-2xl p-5 flex flex-col gap-3 text-left">
        <div className="text-[14px] font-extrabold">{title}</div>
        {children}
      </div>
    </div>
  );
}

export function RowActionsMenu({ row, by, onDone }: {
  row: ApprovalRow;
  /** Name the action is recorded under. */
  by: string;
  onDone: (result: QueueActionResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<null | "hold" | "delete" | "confirm">(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [choice, setChoice] = useState<DeleteReason | "">("");
  const [other, setOther] = useState("");
  // Undecided on purpose: whether the post survives is asked, never assumed.
  const [postChoice, setPostChoice] = useState<"" | "keep" | "cancel">("");
  const title = rowTitle(row);
  const graphic = isGraphicRow(row);
  // A graphic row knows its post through the "goes out on" date; a caption IS
  // its post.
  const hasPost = graphic ? !!row.postDate : true;
  const delReason = deleteReasonText(choice, other);
  const close = () => { if (busy) return; setMode(null); setOpen(false); setReason(""); setChoice(""); setOther(""); setPostChoice(""); };

  const run = async (work: () => Promise<QueueActionResult>, done: string) => {
    setBusy(true);
    try {
      const result = await work();
      onDone(result);
      toastSuccess(done);
      setBusy(false);
      setMode(null); setOpen(false); setReason(""); setChoice(""); setOther(""); setPostChoice("");
    } catch (error) {
      setBusy(false);
      toastError(`ทำรายการไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  return (
    <span className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={`ตัวเลือกเพิ่มเติมของ ${title}`} aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="text-[14px] font-bold leading-none rounded-[9px] px-[9px] py-[6px] border border-line2 bg-surface text-faint hover:text-ink">…</button>
      {open && !mode && (
        <>
          <span className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <span className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-[150px] rounded-[12px] border border-line2 bg-surface shadow-xl py-1 flex flex-col">
            <button type="button" onClick={() => setMode("hold")} className="text-left px-3 py-[8px] text-[12.5px] font-semibold hover:bg-ivory">⏸ Hold</button>
            <button type="button" onClick={() => setMode("delete")} className="text-left px-3 py-[8px] text-[12.5px] font-semibold text-[#C74B4B] hover:bg-[#FFF5F5]">🗑 ลบงาน</button>
          </span>
        </>
      )}

      {mode === "hold" && (
        <Dialog title="⏸ Hold งานนี้?" onClose={close}>
          <div className="text-[12.5px] text-muted"><b className="text-ink">{title}</b> จะออกจากคิวรออนุมัติ ไม่ถูกนับว่าค้างหรือเลยกำหนด และนำกลับมาได้จากกลุ่ม “⏸ Hold” ท้ายหน้า ผู้ส่งงานและผู้ถืองานจะได้รับแจ้งพร้อมเหตุผลนี้</div>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus className={field}
            placeholder="เหตุผล เช่น รอราคาใหม่จากสาขา / แคมเปญเลื่อนไปเดือนหน้า" />
          <div className="text-[11px]" style={{ color: holdReasonValid(reason) ? "#9A9387" : "#B3641E" }}>อย่างน้อย {HOLD_REASON_MIN} ตัวอักษร ({reason.trim().length})</div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} disabled={busy} className="text-[12.5px] font-bold rounded-[9px] px-3 py-[7px] border border-line2 bg-surface disabled:opacity-40">ไม่ Hold</button>
            <button type="button" disabled={busy || !holdReasonValid(reason)}
              onClick={() => { void run(() => holdFromQueue(row, reason, by), "Hold แล้ว — แจ้งผู้ส่งงานและผู้ถืองานแล้ว"); }}
              className="text-[12.5px] font-bold text-white rounded-[9px] px-3 py-[7px] bg-panel disabled:opacity-40">{busy ? "กำลังบันทึก…" : "ยืนยัน Hold"}</button>
          </div>
        </Dialog>
      )}

      {mode === "delete" && (
        <Dialog title="🗑 ลบงานนี้ — เหตุผล" onClose={close}>
          <div className="text-[12.5px] text-muted"><b className="text-ink">{title}</b></div>
          <div className="flex flex-col gap-[6px]">
            {DELETE_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-[12.5px] cursor-pointer">
                <input type="radio" name="del-reason" checked={choice === r} onChange={() => setChoice(r)} />{r}{r === "อื่น ๆ" ? " (กรอกเอง)" : ""}
              </label>
            ))}
            {choice === "อื่น ๆ" && <input value={other} onChange={(e) => setOther(e.target.value)} autoFocus placeholder="เหตุผล" className={field} />}
          </div>
          {hasPost && (
            <div className="rounded-[10px] border border-line2 px-3 py-2 flex flex-col gap-[6px]">
              <div className="text-[11.5px] font-bold text-ink">โพสต์ที่ผูกอยู่</div>
              <label className="flex items-center gap-2 text-[12.5px] cursor-pointer"><input type="radio" name="del-post" checked={postChoice === "keep"} onChange={() => setPostChoice("keep")} />เก็บโพสต์ไว้</label>
              <label className="flex items-center gap-2 text-[12.5px] cursor-pointer"><input type="radio" name="del-post" checked={postChoice === "cancel"} onChange={() => setPostChoice("cancel")} />ยกเลิกโพสต์ด้วย (Cancelled)</label>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="text-[12.5px] font-bold rounded-[9px] px-3 py-[7px] border border-line2 bg-surface">ไม่ลบ</button>
            <button type="button" disabled={!delReason || (hasPost && !postChoice)} onClick={() => setMode("confirm")}
              className="text-[12.5px] font-bold text-white rounded-[9px] px-3 py-[7px] bg-panel disabled:opacity-40">ต่อไป →</button>
          </div>
        </Dialog>
      )}

      {mode === "confirm" && (
        <Dialog title="ยืนยันการลบอีกครั้ง" onClose={close}>
          <ul className="text-[12.5px] text-ink list-disc pl-5 flex flex-col gap-[3px]">
            {(graphic
              ? deleteSummary(row.g, hasPost)
              : [`Caption ของโพสต์ "${title}" จะถูกถอนออกจากคิวอนุมัติ (ข้อความที่เขียนไว้ยังอยู่ สถานะกลับเป็นร่าง)`, "Caption ไม่มีใบงานแยก จึงไม่มีอะไรถูกย้ายลงถังขยะ", "แคมเปญไม่ถูกลบ"]
            ).map((line) => <li key={line}>{line}</li>)}
            {hasPost && <li><b>{postChoice === "cancel" ? "โพสต์จะถูกเปลี่ยนเป็น Cancelled" : "โพสต์ถูกเก็บไว้ตามเดิม"}</b></li>}
            <li>เหตุผล: {delReason}</li>
          </ul>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMode("delete")} disabled={busy} className="text-[12.5px] font-bold rounded-[9px] px-3 py-[7px] border border-line2 bg-surface disabled:opacity-40">← ย้อนกลับ</button>
            <button type="button" disabled={busy}
              onClick={() => { void run(() => deleteFromQueue(row, delReason, by, postChoice === "cancel"), graphic ? "ย้ายใบงานลงถังขยะแล้ว — กู้คืนได้ที่หน้า Trash" : "ถอน Caption ออกจากคิวแล้ว"); }}
              className="text-[12.5px] font-bold text-white rounded-[9px] px-3 py-[7px] disabled:opacity-40" style={{ background: "#C74B4B" }}>{busy ? "กำลังลบ…" : "ยืนยันลบ"}</button>
          </div>
        </Dialog>
      )}
    </span>
  );
}

/** One line per held piece of work — a request with two open checks is held
 *  once, not twice. */
export function heldOnce(rows: ApprovalRow[]): ApprovalRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (!r.held) return false;
    const id = isGraphicRow(r) ? `g:${r.g.id}` : r.kind === "caption" ? `p:${r.post.id}` : r.key;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function HeldGroup({ rows, canAct, by, onDone }: {
  rows: ApprovalRow[]; canAct: boolean; by: string; onDone: (result: QueueActionResult) => void;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const list = heldOnce(rows);
  if (!list.length) return null;
  const resume = async (row: ApprovalRow) => {
    setBusyKey(row.key);
    try {
      onDone(await resumeFromQueue(row, by));
      toastSuccess("นำกลับเข้าคิวรออนุมัติแล้ว");
    } catch (error) {
      toastError(`นำกลับมาไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setBusyKey(null); }
  };
  return (
    <div className="mt-4 rounded-[14px] overflow-hidden" style={{ border: "1px solid #EADBC1", background: "#fff" }}>
      <div className="px-4 py-[9px] text-[11.5px]" style={{ background: "#FFF8E6", borderBottom: "1px solid #EADBC1", color: "#6B5310" }}>
        <b>⏸ Hold</b> · งานที่พักไว้จากคิวอนุมัติ ไม่นับว่ารอใครและไม่นับว่าเลยกำหนด
      </div>
      <FinishedFold count={list.length} storageKey="mos-approval-held" label="Hold">
        {list.map((row) => (
          <div key={row.key} className="flex items-center gap-3 flex-wrap px-4 py-[10px] border-b border-line4 last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-ink truncate">{rowTitle(row)}</div>
              <div className="text-[11.5px] text-muted">เหตุผล: {row.held!.reason}</div>
              <div className="text-[11px] text-faint">Hold โดย {row.held!.by} · {fmtDate(row.held!.at)}</div>
            </div>
            {canAct && (
              <button type="button" onClick={() => { void resume(row); }} disabled={busyKey === row.key}
                className="text-[12px] font-bold rounded-[9px] px-3 py-[6px] border border-line2 bg-surface disabled:opacity-40">
                {busyKey === row.key ? "…" : "▶️ นำกลับมา"}
              </button>
            )}
          </div>
        ))}
      </FinishedFold>
    </div>
  );
}
