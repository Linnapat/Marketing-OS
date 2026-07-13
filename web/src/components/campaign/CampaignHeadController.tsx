"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

const shellStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #ECEAF2",
  borderRadius: 16,
  boxShadow: "0 8px 22px rgba(23, 23, 42, 0.04)",
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
      className="w-7 h-7 rounded-[9px] border border-line2 bg-white/78 flex items-center justify-center text-faint hover:text-ink transition flex-shrink-0"
    >
      <ChevronDown size={14} className="transition-transform" style={{ transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }} />
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
    <section className="px-3 py-2.5 md:px-4" style={shellStyle}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <div className="text-[9.5px] font-extrabold tracking-[0.12em] uppercase" style={{ color: "#6C5CE7" }}>
            {eyebrow}
          </div>
          <h1 className="text-[20px] md:text-[23px] leading-none font-extrabold text-ink">
            {title}
          </h1>
          {!collapsed && (
            <p className="text-[11.5px] md:text-[12px]" style={{ color: "#7D7789" }}>
              {description}
            </p>
          )}
        </div>
        <CollapseButton collapsed={collapsed} onClick={toggle} />
      </div>
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
    <section className="px-3 py-2.5 md:px-4" style={shellStyle}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[9.5px] font-extrabold tracking-[0.12em] uppercase" style={{ color: "#9D96AC" }}>
          Controls
        </div>
        <div className="flex items-center gap-2">
          {action && !collapsed ? <div className="flex items-center gap-3">{action}</div> : null}
          <CollapseButton collapsed={collapsed} onClick={toggle} />
        </div>
      </div>
      {!collapsed && (
        <div className="mt-2 min-w-0 module-head-compact">
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
      className="px-3 py-3 md:px-4"
      style={{
        background: "#17172A",
        border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: 18,
        boxShadow: "0 12px 30px rgba(23, 23, 42, 0.13)",
        ...style,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className={`text-[10.5px] font-extrabold tracking-[0.08em] uppercase ${titleClassName ?? "text-white/70"}`}>
          {title}
        </div>
        <CollapseButton collapsed={collapsed} onClick={toggle} />
      </div>
      {!collapsed && <div className="mt-2 module-summary-compact">{children}</div>}
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
    <section className="px-3 py-2.5 md:px-4" style={shellStyle}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[9.5px] font-extrabold tracking-[0.12em] uppercase" style={{ color: "#9D96AC" }}>
          Filter Bar
        </div>
        <CollapseButton collapsed={collapsed} onClick={toggle} />
      </div>
      {!collapsed && (
        <div className="mt-2 flex flex-col gap-2 module-head-compact">
          {children}
        </div>
      )}
    </section>
  );
}
