import { ReactNode } from "react";
import { clsx } from "@/lib/clsx";

export function Card({
  children,
  className,
  as: As = "div",
  dark = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
  dark?: boolean;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <As
      className={clsx(
        "rounded-cardLg",
        dark ? "bg-panel border border-panel" : "bg-surface border border-line",
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
}

/** Small uppercase section eyebrow used above card groups. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "text-[11px] font-bold tracking-[0.08em] uppercase text-faint",
        className,
      )}
    >
      {children}
    </div>
  );
}
