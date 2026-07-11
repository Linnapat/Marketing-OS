"use client";

import { usePathname } from "next/navigation";

const MODULE_STYLES: Record<string, { fg: string; bg: string; border: string }> = {
  "/campaigns": { fg: "#6C5CE7", bg: "#EEE9FF", border: "#D9D0FF" },
  "/content": { fg: "#5D9E35", bg: "#F0F8D8", border: "#DCECB4" },
  "/graphic": { fg: "#D876AA", bg: "#FDEBF3", border: "#F5CFE0" },
  "/kol": { fg: "#E08A34", bg: "#FFF3E5", border: "#FFD8AD" },
  "/ads": { fg: "#3FA7D6", bg: "#EDF8FE", border: "#CBEFFF" },
  "/expenses": { fg: "#4BA06B", bg: "#EAF8EE", border: "#CDEBD6" },
  "/finance": { fg: "#B78E2D", bg: "#FFF3D7", border: "#F4E0AA" },
  "/my-tasks": { fg: "#E15B5B", bg: "#FFF0F0", border: "#F5CCCC" },
  "/team": { fg: "#5A7CFF", bg: "#EAF1FF", border: "#D6E1FF" },
  "/workflow": { fg: "#5A7CFF", bg: "#EAF1FF", border: "#D6E1FF" },
  "/assets": { fg: "#8A62D7", bg: "#F1ECFF", border: "#DDD1FF" },
  "/agency": { fg: "#6F6A86", bg: "#F4F2F8", border: "#E6E1EF" },
  "/settings": { fg: "#6F6A86", bg: "#F4F2F8", border: "#E6E1EF" },
  "/": { fg: "#6C5CE7", bg: "#EEE9FF", border: "#D9D0FF" },
};

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const pathname = usePathname();
  const style = Object.entries(MODULE_STYLES).find(([key]) => key !== "/" && pathname.startsWith(key))?.[1] ?? MODULE_STYLES["/"];
  return (
    <div className="flex items-end justify-between flex-wrap gap-[12px] mb-[6px]">
      <div>
        {eyebrow && (
          <div
            className="inline-flex items-center rounded-pill px-3 py-[6px] text-[11px] font-bold tracking-[0.12em] uppercase"
            style={{ color: style.fg, background: style.bg, border: `1px solid ${style.border}` }}
          >
            {eyebrow}
          </div>
        )}
        <div className="text-[25px] font-extrabold letter-tightest mt-[8px] text-ink">{title}</div>
        {subtitle && <div className="text-[13.5px] text-faint mt-[5px] max-w-[720px]">{subtitle}</div>}
      </div>
      {right && <div className="text-[13px] text-muted">{right}</div>}
    </div>
  );
}
