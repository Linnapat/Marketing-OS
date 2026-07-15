import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PerformanceTabs } from "./PerformanceTabs";

export function PerformancePlaceholder({
  title,
  subtitle,
  emoji,
}: {
  title: string;
  subtitle: string;
  emoji: string;
}) {
  return (
    <>
      <PageHeader eyebrow="Performance" title={title} subtitle={subtitle} />
      <PerformanceTabs />
      <section className="mt-4 rounded-[28px] border border-[#BCEBE6] bg-[#E3F7F5] p-6 shadow-soft">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-white/75 text-[30px]">
            {emoji}
          </div>
          <div className="min-w-[220px] flex-1">
            <div className="text-[18px] font-extrabold text-ink">Data view ready</div>
            <div className="mt-1 max-w-[760px] text-[13px] font-semibold leading-relaxed text-[#54756E]">
              พื้นที่นี้แยกจาก workflow งานและเตรียมไว้สำหรับเชื่อมข้อมูล performance เฉพาะมุมนี้โดยตรง
            </div>
          </div>
        </div>
      </section>
      <section className="mt-4 rounded-[24px] border border-line bg-surface p-6 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-[#17172A] text-white">
            <BarChart3 size={20} />
          </div>
          <div>
            <div className="text-[14px] font-extrabold text-ink">Performance-only surface</div>
            <div className="mt-1 text-[12.5px] text-faint">
              ไม่มี request, approval queue, task list หรือ flow การทำงานในหน้านี้ — ใช้สำหรับอ่านผล วิเคราะห์ และตัดสินใจเท่านั้น
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
