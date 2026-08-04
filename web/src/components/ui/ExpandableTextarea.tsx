"use client";

// A textarea that can be popped out to fill the screen.
//
// Captions are written inside a drawer, in a box six rows tall, against a brief
// that runs to eight fields — so the thing you are writing and the thing you
// are writing FROM never fit on screen together, and a long caption scrolled
// past itself two lines at a time.
//
// Expanded rather than opened in a browser tab: a real tab would need the draft
// synced between two documents to avoid one of them silently winning, and
// closing the wrong one would be a way to lose work. This is the same field,
// same state, just given the room — nothing to reconcile, and Esc puts it back.
//
// `aside` is for the reference material that belongs beside the writing (the
// brief guide, in the caption's case): it sits in a column of its own while
// expanded, and is the caller's problem inline.

import { useEffect, ReactNode } from "react";

export function ExpandableTextarea({
  value, onChange, expanded, onExpandedChange, placeholder, rows = 6, className = "",
  title = "แก้ไขข้อความ", aside, asideTitle, disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Held by the caller so the drawer around it can react (and so the pop-out
   *  survives a re-render it does not own). */
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  title?: ReactNode;
  aside?: ReactNode;
  asideTitle?: string;
  disabled?: boolean;
}) {
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onExpandedChange(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [expanded, onExpandedChange]);

  const count = <span className="text-[11px] text-faint">{value.length} ตัวอักษร</span>;

  return (
    <>
      <div className="relative">
        <textarea
          rows={rows}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${className} resize-y leading-[1.5]`}
        />
        {/* Top-right, clear of the browser's own resize grip in the corner. */}
        <button
          type="button"
          onClick={() => onExpandedChange(true)}
          title="ขยายเต็มจอ (Esc เพื่อย่อกลับ)"
          aria-label="ขยายกล่องข้อความเต็มจอ"
          className="absolute top-[7px] right-[9px] text-[11px] font-bold rounded-[7px] px-[7px] py-[3px] border border-line2 bg-surface/90 text-muted hover:text-ink"
        >
          ⤢ ขยาย
        </button>
      </div>

      {expanded && (
        <div className="fixed inset-0 z-[300] flex flex-col p-3 md:p-5" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/45" onClick={() => onExpandedChange(false)} />
          <div className="relative flex flex-col flex-1 min-h-0 bg-surface rounded-cardLg border border-line shadow-2xl overflow-hidden">
            {/* Wraps rather than pushing the way out off-screen: on a phone the
                title alone is wider than the row, and an unreachable close
                button in a full-screen overlay is a trap. */}
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap px-4 md:px-5 py-3 border-b border-line3 flex-shrink-0">
              <div className="text-[13px] md:text-[14px] font-extrabold text-ink min-w-0 truncate">{title}</div>
              <div className="ml-auto flex items-center gap-3 flex-shrink-0">
                {count}
                <button
                  type="button"
                  onClick={() => onExpandedChange(false)}
                  className="text-[12px] font-bold rounded-[8px] px-3 py-[6px] border border-line2 bg-surface text-muted"
                >
                  ⤡ ย่อกลับ · Esc
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 p-4 md:p-5 overflow-y-auto lg:overflow-hidden">
              <textarea
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                autoFocus
                className="flex-1 min-h-[45vh] lg:min-h-0 w-full text-[15px] leading-[1.7] px-4 py-3 rounded-[12px] border-[1.5px] border-line2 bg-ivory outline-none font-sans resize-none"
              />
              {aside && (
                <aside className="lg:w-[340px] lg:flex-shrink-0 lg:overflow-y-auto">
                  {asideTitle && (
                    <div className="text-[11px] tracking-[0.06em] uppercase font-bold text-faint mb-2">{asideTitle}</div>
                  )}
                  {aside}
                </aside>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
