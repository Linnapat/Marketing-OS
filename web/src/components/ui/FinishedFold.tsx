"use client";

// Finished work, folded to the bottom of a list.
//
// A month's plan is mostly work that is already out the door, and it sits
// between the things that still need doing. The fix is not another status for
// someone to remember to set — a manual "archive" step is skipped on exactly
// the busy days it would help, and then the status means nothing. This reads
// the state the row already has and folds it away on its own.
//
// Folded, never hidden: the count stays on screen and one click brings the rows
// back, because "where did last week's posts go" is a worse problem than a long
// list. Open/closed is remembered per list.

import { useEffect, useState } from "react";

export function FinishedFold({ count, storageKey, label = "เสร็จแล้ว", children }: {
  /** How many rows are folded away — shown even when closed. */
  count: number;
  /** localStorage key; unique per list so Content and Graphic don't share one. */
  storageKey: string;
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(localStorage.getItem(storageKey) === "1");
    } catch {
      /* no-op */
    }
  }, [storageKey]);

  const toggle = () => {
    setOpen((current) => {
      const next = !current;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* no-op */
      }
      return next;
    });
  };

  if (count === 0) return null;

  return (
    <div className="border-t border-line4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-5 py-[10px] text-left hover:bg-ivory/60"
        style={{ background: "#FBF9F4" }}
      >
        <span className="text-[11px] text-faint" aria-hidden>{open ? "▾" : "▸"}</span>
        <span className="text-[12px] font-bold text-muted">✓ {label} {count} รายการ</span>
        <span className="text-[11px] text-faint">{open ? "— ซ่อน" : "— กดเพื่อดู"}</span>
      </button>
      {open && children}
    </div>
  );
}
