"use client";

// Shared centered modal shell (audit P3-2). Replaces the ad-hoc
// overlay+panel markup copied across the app. Adds Esc-to-close and body
// scroll-lock, which the hand-rolled copies didn't have. Adopt incrementally:
//   <Modal open={open} onClose={close} title="New campaign" maxWidth="lg">…</Modal>

import { useEffect, ReactNode } from "react";

const MAX_W: Record<string, string> = {
  sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-xl", "2xl": "max-w-2xl",
};

export function Modal({
  open, onClose, title, children, maxWidth = "lg", footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  maxWidth?: keyof typeof MAX_W;
  footer?: ReactNode;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-surface rounded-cardLg border border-line shadow-2xl w-full ${MAX_W[maxWidth]} p-6 max-h-[90vh] overflow-y-auto`}>
        {title !== undefined && (
          <div className="flex items-start justify-between mb-4">
            <div className="text-[16px] font-extrabold">{title}</div>
            <button onClick={onClose} aria-label="Close" className="text-[18px] text-faint leading-none -mt-1">✕</button>
          </div>
        )}
        {children}
        {footer && <div className="mt-5 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
