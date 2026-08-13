"use client";

// The one number a campaign is called by.
//
// A campaign used to show two: the app's per-brand running code and a
// hand-written one typed into the name ("CPN010_Seasonal menu"). The names were
// cleaned up on 31 Jul 2026, which only works if the running code is visible
// wherever a campaign name is — otherwise the modules lost a number instead of
// agreeing on one. Same pill everywhere so it reads as the same thing.
//
// Renders nothing without a code: campaigns created before the code existed have
// all been backfilled, but a row read from an older cache still might not have one,
// and an empty pill would look like a bug.

import { useEffect, useRef, useState } from "react";

/** A code pill you can take with you.
 *
 *  Designers name their files after the job number, and the number was on
 *  screen as text you had to retype — the title attribute "so it can be copied
 *  from anywhere" is not something you can copy from at all, you can only read
 *  it. One click now puts it on the clipboard (requested 31 Jul).
 *
 *  Two details that matter on these rows:
 *   - stopPropagation, because most of these pills sit inside a card that opens
 *     a drawer. Copying a number must not also navigate.
 *   - the FULL code goes to the clipboard even when the pill shows the short
 *     form, since the filename is what this is for.
 *
 *  Clipboard access fails on an insecure origin and can be refused outright, so
 *  a failure leaves the pill as it was rather than claiming a copy that never
 *  happened. */
function CodePill({ text, copy, title, background, color, className }: {
  text: string;
  copy: string;
  title: string;
  background: string;
  color: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(copy);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1400);
    } catch { /* refused or insecure origin — say nothing rather than lie */ }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      title={copied ? "คัดลอกแล้ว" : `${title} · คลิกเพื่อคัดลอก`}
      aria-label={`${title} ${copy} — คลิกเพื่อคัดลอก`}
      className={`text-[11px] font-extrabold rounded-pill px-[7px] py-[2px] whitespace-nowrap cursor-pointer transition hover:brightness-95 ${className ?? ""}`}
      style={copied ? { background: "#EAF2EC", color: "#3F7A52" } : { background, color }}
    >
      {copied ? "✓ คัดลอกแล้ว" : text}
    </button>
  );
}

export function CampaignCode({ code, className }: { code?: string; className?: string }) {
  if (!code) return null;
  return (
    <CodePill
      text={`#${code}`}
      copy={code}
      title="รหัสแคมเปญ"
      background="#F2EEFF"
      color="#6C5CE7"
      className={className}
    />
  );
}

/** `#TPN-2026-006 · Seasonal menu` as plain text, for the places that take a
 *  string rather than a node — tooltips, notification bodies, exports. */
export function campaignLabel(code: string | undefined, name: string): string {
  return code ? `#${code} · ${name}` : name;
}

/** The job number of one post or artwork (TPN_2609_003-C02-A01).
 *
 *  Deliberately a different colour from the campaign pill. The two sit side by
 *  side on the same row and the work code CONTAINS the campaign code, so in one
 *  colour a row would read as the same number printed twice.
 *
 *  Shows only the part below the campaign by default ("C02-A01"), because the
 *  campaign is almost always already named on the row; `full` prints the whole
 *  thing for the surfaces where it stands alone. Clicking copies the whole code
 *  either way — the short form is a label, the full one is the filename. */
export function WorkCode({ code, full, className }: { code?: string; full?: boolean; className?: string }) {
  if (!code) return null;
  const short = code.includes("-") ? code.slice(code.indexOf("-") + 1) : code;
  return (
    <CodePill
      text={full ? code : short}
      copy={code}
      title="เลขงาน"
      background="#EAF2EC"
      color="#3F7A52"
      className={className}
    />
  );
}
