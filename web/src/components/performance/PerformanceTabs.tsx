"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const PERFORMANCE_TABS = [
  { href: "/performance", label: "Marketing Overview Performance" },
  { href: "/performance/creative-kpi", label: "Creative KPI Performance" },
  { href: "/performance/platform", label: "Platform / Ads Performance" },
  { href: "/performance/campaign-roi", label: "Campaign ROI Performance" },
  { href: "/performance/kol", label: "KOL Performance" },
];

export function PerformanceTabs() {
  const pathname = usePathname();
  return (
    <div className="mt-4 overflow-x-auto rounded-[22px] border border-[#BCEBE6] bg-white/80 p-2 shadow-soft">
      <div className="flex min-w-max gap-2">
        {PERFORMANCE_TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="rounded-[16px] px-4 py-3 text-[12.5px] font-extrabold transition"
              style={{
                background: active ? "#0EA5A0" : "#E3F7F5",
                color: active ? "#FFFFFF" : "#0B7F7A",
                boxShadow: active ? "0 12px 28px rgba(14,165,160,0.24)" : "none",
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
