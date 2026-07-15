"use client";

import Link from "next/link";
import { BarChart3, LineChart, Megaphone, Star, ArrowRight, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PerformanceTabs } from "@/components/performance/PerformanceTabs";

const cards = [
  {
    href: "/performance/creative-kpi",
    icon: Sparkles,
    title: "Creative KPI Performance",
    desc: "อ่านผล Creative จาก Content_2026: Reach, Share rate, Skip rate, Top content และ brand health",
    status: "Connected",
    bg: "#E3F7F5",
    fg: "#0EA5A0",
  },
  {
    href: "/performance/platform",
    icon: Megaphone,
    title: "Platform / Ads Performance",
    desc: "พื้นที่สำหรับรวมผล Meta Ads, TikTok Ads, LINE Ads, Google และ spend actual ราย platform",
    status: "Data view",
    bg: "#EDF8FE",
    fg: "#3FA7D6",
  },
  {
    href: "/performance/campaign-roi",
    icon: LineChart,
    title: "Campaign ROI Performance",
    desc: "มุมวิเคราะห์ Budget, Actual, Revenue, ROAS และกำไรต่อแคมเปญ",
    status: "Data view",
    bg: "#EEE9FF",
    fg: "#6C5CE7",
  },
  {
    href: "/performance/kol",
    icon: Star,
    title: "KOL Performance",
    desc: "มุมวัดผล expected reach, actual reach, visit, cost และผลลัพธ์จาก KOL / Influencer",
    status: "Data view",
    bg: "#FFF3E5",
    fg: "#E08A34",
  },
];

export default function PerformanceLandingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Performance"
        title="Performance"
        subtitle="Performance hub สำหรับดูผลลัพธ์ทางการตลาดเท่านั้น — แยก Creative, Platform, Campaign ROI และ KOL ออกจาก workflow งาน"
      />

      <PerformanceTabs />

      <section className="mt-4 rounded-[28px] border border-[#BCEBE6] bg-[#E3F7F5] p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#0B7F7A]">Performance dashboard</div>
            <h2 className="mt-2 text-[24px] font-extrabold text-ink">Marketing Overview Performance</h2>
            <p className="mt-1 max-w-[780px] text-[13px] font-semibold leading-relaxed text-[#54756E]">
              หน้านี้ตั้งใจให้เป็นพื้นที่อ่านตัวเลขล้วน ๆ ไม่มี approval, request, task หรือ flow งานมาแทรก เพื่อให้โฟกัสเฉพาะ performance insight
            </p>
          </div>
          <div className="hidden rounded-[22px] bg-white/70 p-5 text-[42px] md:block">
            📊
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const content = (
            <div className="h-full rounded-[24px] border border-line bg-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(23,23,42,0.10)]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[16px]" style={{ background: card.bg, color: card.fg }}>
                  <Icon size={22} />
                </div>
                <span className="rounded-pill px-3 py-1 text-[11px] font-extrabold" style={{ background: card.bg, color: card.fg }}>
                  {card.status}
                </span>
              </div>
              <div className="mt-5 text-[18px] font-extrabold text-ink">{card.title}</div>
              <div className="mt-2 min-h-[72px] text-[12.5px] font-semibold leading-relaxed text-faint">{card.desc}</div>
              <div className="mt-5 inline-flex items-center gap-2 text-[12.5px] font-extrabold" style={{ color: card.fg }}>
                Open data view <ArrowRight size={14} />
              </div>
            </div>
          );
          return <Link key={card.title} href={card.href}>{content}</Link>;
        })}
      </section>

      <section className="mt-4 rounded-[24px] border border-line bg-surface p-5 shadow-soft">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-[#17172A] text-white">
            <BarChart3 size={20} />
          </div>
          <div className="min-w-[220px] flex-1">
            <div className="text-[14px] font-extrabold text-ink">Clean performance space</div>
            <div className="mt-1 text-[12.5px] text-faint">
              หน้า Performance นี้แยกจากงานปฏิบัติการ: ไม่มี task list, approval queue, requester หรือปุ่มส่งงาน — มีเฉพาะข้อมูลสำหรับอ่านผลและตัดสินใจ
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
