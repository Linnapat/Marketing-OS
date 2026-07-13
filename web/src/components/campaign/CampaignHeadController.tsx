"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

const shellStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #ECEAF2",
  borderRadius: 18,
  boxShadow: "0 10px 30px rgba(23, 23, 42, 0.05)",
};

function keyFor(scope: string, label: string) {
  return `mkt-os:${scope}:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function usePanelCollapsed(scope: string, label: string) {
  const key = keyFor(scope, label);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(key) === "1");
    } catch {
      /* no-op */
    }
  }, [key]);

  const toggle = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* no-op */
      }
      return next;
    });
  };

  return { collapsed, toggle };
}

function CollapseButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={collapsed ? "Expand section" : "Collapse section"}
      onClick={onClick}
      className="w-8 h-8 rounded-[10px] border border-line2 bg-white/80 flex items-center justify-center text-faint hover:text-ink transition flex-shrink-0"
    >
      <ChevronDown size={16} className="transition-transform" style={{ transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }} />
    </button>
  );
}

export function CampaignPageHeaderSection({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  const { collapsed, toggle } = usePanelCollapsed("page-header", title);

  return (
    <section className="px-4 py-4 md:px-5 md:py-4" style={shellStyle}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold tracking-[0.12em] uppercase" style={{ color: "#6C5CE7" }}>
            {eyebrow}
          </div>
          <h1 className="mt-2 text-[23px] md:text-[28px] leading-none font-extrabold text-ink">
            {title}
          </h1>
        </div>
        <CollapseButton collapsed={collapsed} onClick={toggle} />
      </div>
      {!collapsed && (
        <p className="mt-2 text-[12px] md:text-[13px]" style={{ color: "#7D7789" }}>
          {description}
        </p>
      )}
    </section>
  );
}

export function CampaignCommandBar({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  const { collapsed, toggle } = usePanelCollapsed("command-bar", "controls");

  return (
    <section className="px-4 py-3 md:px-4" style={shellStyle}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-bold tracking-[0.12em] uppercase" style={{ color: "#9D96AC" }}>
          Controls
        </div>
        <div className="flex items-center gap-2">
          {action && !collapsed ? <div className="flex items-center gap-3">{action}</div> : null}
          <CollapseButton collapsed={collapsed} onClick={toggle} />
        </div>
      </div>
      {!collapsed && (
        <div className="mt-3 min-w-0">
          {children}
        </div>
      )}
    </section>
  );
}

export function ModuleSummaryCard({
  title,
  children,
  style,
  titleClassName,
}: {
  title: string;
  children: ReactNode;
  style?: CSSProperties;
  titleClassName?: string;
}) {
  const { collapsed, toggle } = usePanelCollapsed("summary-card", title);

  return (
    <section
      className="px-4 py-4 md:px-5 md:py-4"
      style={{
        background: "#17172A",
        border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: 20,
        boxShadow: "0 16px 40px rgba(23, 23, 42, 0.18)",
        ...style,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className={`text-[12px] font-bold tracking-[0.04em] uppercase ${titleClassName ?? "text-white/70"}`}>
          {title}
        </div>
        <CollapseButton collapsed={collapsed} onClick={toggle} />
      </div>
      {!collapsed && <div className="mt-3">{children}</div>}
    </section>
  );
}

export function FilterBar({
  children,
}: {
  children: ReactNode;
}) {
  const { collapsed, toggle } = usePanelCollapsed("filter-bar", "filter-bar");

  return (
    <section className="px-4 py-4 md:px-5 md:py-4" style={shellStyle}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-bold tracking-[0.12em] uppercase" style={{ color: "#9D96AC" }}>
          Filter Bar
        </div>
        <CollapseButton collapsed={collapsed} onClick={toggle} />
      </div>
      {!collapsed && (
        <div className="mt-3 flex flex-col gap-3">
          {children}
        </div>
      )}
    </section>
  );
}
