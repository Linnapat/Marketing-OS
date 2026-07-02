import { Tone, TONES } from "@/lib/status";

/** Pill badge. Pass a semantic tone, or explicit fg/bg for one-off colors. */
export function StatusBadge({
  children,
  tone = "neutral",
  fg,
  bg,
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  fg?: string;
  bg?: string;
  className?: string;
}) {
  const c = TONES[tone];
  return (
    <span
      className={`inline-block text-[11px] font-bold px-[9px] py-[3px] rounded-pill whitespace-nowrap ${className ?? ""}`}
      style={{ color: fg ?? c.fg, background: bg ?? c.bg }}
    >
      {children}
    </span>
  );
}
