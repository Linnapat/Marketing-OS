"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, LineChart, Megaphone, Sparkles, Star, Target } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

const sections = [
  {
    title: "Marketing Overview Performance",
    note: "ภาพรวม reach, engagement, spend, revenue และ health ของแต่ละแบรนด์",
    icon: LineChart,
    tone: { bg: "#E3F7F5", fg: "#0EA5A0" },
  },
  {
    title: "Creative KPI Performance",
    note: "ดูว่า creative แบบไหนทำงานดี เหมาะสำหรับสรุป learning ให้ทีม",
    icon: Sparkles,
    tone: { bg: "#FDEBF3", fg: "#D876AA" },
  },
  {
    title: "Platform / Ads Performance",
    note: "เชื่อมกับ Performance Bar สำหรับ actual spend, reach, conversions และ CPR",
    icon: BarChart3,
    tone: { bg: "#E3F7F5", fg: "#0EA5A0" },
    href: "/platforms",
  },
  {
    title: "Campaign ROI Performance",
    note: "สรุป ROI / ROAS ราย campaign และเทียบกับ budget allocation",
    icon: Target,
    tone: { bg: "#EEE9FF", fg: "#6C5CE7" },
  },
  {
    title: "KOL Performance",
    note: "ดู cost, reach, result และ learning ของ creator / influencer",
    icon: Star,
    tone: { bg: "#FFF3E5", fg: "#E08A34" },
  },
];

export default function PerformanceCenterPage() {
  return (
    <>
      <PageHeader
        eyebrow="QC"
        title="Performance Center"
        subtitle="พื้นที่รวมการวิเคราะห์ผลลัพธ์ — แยกจาก flow งานประจำ แต่เชื่อมกลับไป Performance Bar ได้ทันที"
      />

      <section className="mt-5 rounded-[28px] border border-line bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#0B7F7A]">QC Command</div>
            <h2 className="mt-2 text-[26px] font-extrabold tracking-[-0.03em] text-ink">Choose your performance view</h2>
            <p className="mt-2 max-w-[720px] text-[14px] font-semibold text-faint">
              ใช้หน้านี้เป็น landing สำหรับ performance ที่เป็นเชิงวิเคราะห์ ส่วนการลง actual / budget ยังใช้ Performance Bar เหมือนเดิม
            </p>
          </div>
          <Link
            href="/platforms"
            className="inline-flex items-center gap-2 rounded-[16px] bg-[#17172A] px-4 py-3 text-[13px] font-extrabold text-white"
          >
            Open Performance Bar <ArrowRight size={16} />
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => {
            const Icon = section.icon;
            const card = (
              <div className="h-full rounded-[24px] border border-line bg-[#FBFAF7] p-5 transition hover:-translate-y-0.5 hover:shadow-soft">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-[17px]"
                  style={{ background: section.tone.bg, color: section.tone.fg }}
                >
                  <Icon size={22} />
                </div>
                <div className="mt-5 text-[18px] font-extrabold tracking-[-0.02em] text-ink">{section.title}</div>
                <div className="mt-2 min-h-[42px] text-[13.5px] font-semibold leading-relaxed text-faint">{section.note}</div>
                <div className="mt-5 inline-flex items-center gap-2 text-[13px] font-extrabold" style={{ color: section.tone.fg }}>
                  {section.href ? "Open tool" : "Coming next"} <ArrowRight size={15} />
                </div>
              </div>
            );
            return section.href ? (
              <Link key={section.title} href={section.href}>
                {card}
              </Link>
            ) : (
              <div key={section.title}>{card}</div>
            );
          })}
        </div>
      </section>

      <section className="mt-5 rounded-[24px] border border-[#BCEBE6] bg-[#E3F7F5] p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Megaphone size={20} className="text-[#0B7F7A]" />
          <div>
            <div className="text-[14px] font-extrabold text-ink">Rule of thumb</div>
            <div className="text-[13px] font-semibold text-[#4B766F]">
              Performance Bar = ลง actual / ตรวจงบ • Performance Center = อ่าน insight / ตัดสินใจต่อ
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
