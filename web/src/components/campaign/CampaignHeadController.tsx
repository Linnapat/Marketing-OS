"use client";

import type { CSSProperties, ReactNode } from "react";

const shellStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #ECEAF2",
  borderRadius: 24,
  boxShadow: "0 10px 30px rgba(23, 23, 42, 0.05)",
};

export function CampaignPageHeaderSection({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="px-6 py-6 md:px-7 md:py-7" style={shellStyle}>
      <div className="text-[12px] font-bold tracking-[0.14em] uppercase" style={{ color: "#6C5CE7" }}>
        {eyebrow}
      </div>
      <h1 className="mt-3 text-[30px] md:text-[36px] leading-none font-extrabold letter-tightest text-ink">
        {title}
      </h1>
      <p className="mt-3 text-[14px] md:text-[15px]" style={{ color: "#7D7789" }}>
        {description}
      </p>
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
  return (
    <section className="px-4 py-4 md:px-5" style={shellStyle}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">{children}</div>
        {action ? <div className="flex items-center gap-3 self-start xl:self-auto">{action}</div> : null}
      </div>
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
  return (
    <section
      className="px-5 py-5 md:px-6 md:py-6"
      style={{
        background: "#17172A",
        border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: 24,
        boxShadow: "0 16px 40px rgba(23, 23, 42, 0.18)",
        ...style,
      }}
    >
      <div className={`text-[13px] font-bold tracking-[0.04em] uppercase mb-4 ${titleClassName ?? "text-white/70"}`}>
        {title}
      </div>
      {children}
    </section>
  );
}

export function FilterBar({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <section className="px-5 py-5 md:px-6 md:py-6" style={shellStyle}>
      <div className="text-[12px] font-bold tracking-[0.12em] uppercase mb-4" style={{ color: "#9D96AC" }}>
        Filter Bar
      </div>
      <div className="flex flex-col gap-4">
        {children}
      </div>
    </section>
  );
}
