"use client";

// Shared right-side slide-over shell (audit P3-2). The KOL / Graphic / Content
// drawers each hand-rolled this overlay + panel; this primitive centralises the
// container, Esc-to-close and body scroll-lock. The drawer's own header/body go
// in as children so each surface keeps its bespoke content.
//   <Drawer open onClose={close} maxWidth={720}>…</Drawer>

import { useEffect, ReactNode } from "react";

export function Drawer({
  open, onClose, children, maxWidth = 720, className = "",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Panel max width in px. */
  maxWidth?: number;
  /** Extra classes for the panel (e.g. a background colour). */
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`absolute inset-y-0 right-0 w-full bg-ivory shadow-2xl flex flex-col ${className}`}
        style={{ maxWidth }}
      >
        {children}
      </div>
    </div>
  );
}
