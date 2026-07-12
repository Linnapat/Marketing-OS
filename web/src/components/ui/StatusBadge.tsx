import { Tone, TONES } from "@/lib/status";

function alpha(hex: string, opacity: number) {
  if (!hex.startsWith("#")) return `rgba(23, 23, 42, ${opacity})`;
  const clean = hex.slice(1);
  const value = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = Number.parseInt(value, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

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
  const text = fg ?? c.fg;
  const fill = bg ?? c.bg;
  return (
    <span
      className={`inline-flex min-h-[24px] items-center text-[11.5px] font-bold px-[10px] py-[4px] rounded-pill whitespace-nowrap ${className ?? ""}`}
      style={{ color: text, background: fill, border: `1px solid ${alpha(text, 0.16)}` }}
    >
      {children}
    </span>
  );
}
