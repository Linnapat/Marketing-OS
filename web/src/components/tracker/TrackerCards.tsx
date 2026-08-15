"use client";

/* การ์ดของ Work Tracker — ส่วนที่วาดอย่างเดียว ไม่มี fetch ไม่มี state ของหน้า
 *
 * แยกออกจาก page.tsx เพราะหน้าเดียวมีทั้งการโหลด การกรอง และการวาดการ์ด 4 ระดับ
 * แล้วอ่านยาก และเพราะการ์ดพวกนี้เป็นของที่อยากเอาไปวางที่อื่นได้ในภายหลัง
 * (เช่นในหน้าแคมเปญ) โดยไม่ต้องลากตัวโหลดข้อมูลไปด้วย */

import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { BrandId, brandName } from "@/lib/brands";
import { clsx } from "@/lib/clsx";
import { workLink } from "@/lib/deepLink";
import { HEALTH_META } from "@/lib/data/statusBoard";
import type { ProductionStep } from "@/lib/data/graphic";
import { TrackerCampaign, TrackerJob, TrackerPost, UNASSIGNED, hasDesigner } from "@/lib/data/tracker";

export function Kpi({ label, value, fg, bg, border, hint, active, onClick }: {
  label: string; value: number; fg: string; bg: string; border: string; hint: string;
  active?: boolean; onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      title={hint}
      className={clsx("rounded-card px-4 py-3 text-left border transition", onClick && "cursor-pointer")}
      style={{ background: bg, borderColor: active ? fg : border, borderWidth: active ? 2 : 1 }}
    >
      <div className="text-[22px] font-extrabold leading-none" style={{ color: fg }}>{value}</div>
      <div className="mt-1 text-[11.5px] font-bold" style={{ color: fg }}>{label}</div>
      <div className="mt-[2px] text-[10.5px] leading-tight" style={{ color: fg, opacity: 0.75 }}>{hint}</div>
    </Tag>
  );
}

/* ── แคมเปญหนึ่งกลุ่ม ───────────────────────────────────────────────────── */

export function CampaignSection({ group, showJobs, collapsed, onToggle }: {
  group: TrackerCampaign; showJobs: boolean; collapsed: boolean; onToggle: () => void;
}) {
  const meta = HEALTH_META[group.health];
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-ivory transition">
        <span className="text-faint shrink-0">{collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</span>
        {group.brand && <BrandDot brand={group.brand as BrandId} />}
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold text-ink truncate">{group.name}</div>
          <div className="text-[11.5px] text-faint truncate">
            {group.campaignId === UNASSIGNED
              ? "งานที่ยังไม่ผูกกับแคมเปญไหน — ตรวจชื่อแคมเปญในต้นทาง"
              : [
                group.brand ? brandName(group.brand as BrandId) : "—",
                group.status,
                // แคมเปญที่โผล่มาเพราะมีแต่ใบงานลอย เขียน "0 โพสต์" แล้วอ่านเหมือน
                // แคมเปญร้าง ทั้งที่สิ่งที่ต้องบอกคือมีงานที่ยังผูกกับแผนไม่ได้
                group.posts.length ? `${group.posts.length} โพสต์` : `${group.looseJobs.length} ใบงานที่ยังไม่ผูกกับโพสต์`,
              ].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {group.jobsOverdue > 0 && (
            <span className="rounded-pill px-2.5 py-[3px] text-[11px] font-bold" style={{ background: "#FFF5F4", color: "#B33A2E" }}>
              ใบงานสาย {group.jobsOverdue}
            </span>
          )}
          <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
        </div>
      </button>

      {/* grid-cols-1 ต้องเขียนตรง ๆ ที่ base ไม่ใช่ปล่อยให้เป็นคอลัมน์โดยปริยาย
          คอลัมน์โดยปริยายกว้างแบบ auto = min-content และการ์ดมีข้อความ truncate
          (whitespace-nowrap) ซึ่ง min-content คือความยาวเต็มบรรทัด บนมือถือ
          การ์ดจึงกว้าง 391px ในจอ 375px แล้วทั้งหน้าเลื่อนซ้ายขวาได้
          grid-cols-N ของ Tailwind เป็น minmax(0,1fr) อยู่แล้ว จึงยุบได้ถูกต้อง */}
      {!collapsed && (
        <div className="border-t border-line3 p-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {group.posts.map((p) => <PostCard key={p.id} post={p} showJobs={showJobs} />)}
          {group.looseJobs.map((j) => <LooseJobCard key={`loose-${j.id}`} job={j} />)}
        </div>
      )}
    </div>
  );
}

/* ── การ์ดหนึ่งใบ = โพสต์หนึ่งโพสต์ ─────────────────────────────────────── */

const DAY = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
function thaiDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(+d)) return iso;
  return `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${d.toLocaleDateString("th-TH", { month: "short", timeZone: "UTC" })}`;
}

export function PostCard({ post, showJobs }: { post: TrackerPost; showJobs: boolean }) {
  const meta = HEALTH_META[post.health];
  const late = post.urgency === "overdue";
  return (
    <div
      className="border rounded-card p-[13px] flex flex-col gap-2.5 bg-surface transition hover:border-accent min-w-0"
      style={late || post.jobsOverdue > 0 ? { borderColor: "#F5C8C4" } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-faint tracking-[0.04em]">
            {thaiDate(post.dateIso)} · {post.platforms.join(" · ")}
          </div>
          <Link href={workLink.post(post.id)} className="text-[13.5px] font-bold text-ink leading-tight hover:text-accent block truncate">
            {post.title}
          </Link>
          {post.code && <div className="text-[10.5px] text-faint font-mono mt-[1px]">{post.code}</div>}
        </div>
        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
      </div>

      {/* ธงที่ปฏิทินโพสต์มองไม่เห็น — ใบงานเลย due แล้วแม้โพสต์ยังไม่ถึงวันลง */}
      {post.jobsOverdue > 0 && (
        <div className="text-[11px] font-bold rounded-card px-2 py-1.5" style={{ background: "#FFF5F4", color: "#B33A2E" }}>
          ⚠ ใบงานเลยกำหนดแล้ว {post.jobsOverdue} ใบ — โพสต์ลง {thaiDate(post.dateIso)}
        </div>
      )}

      {!showJobs ? (
        <div className="rounded-card px-2.5 py-2 text-[11.5px]" style={{ background: "#F4F2F8", color: "#6F6A86" }}>
          สถานะการผลิตถูกซ่อน — ต้องมีสิทธิ์โมดูล Graphic
        </div>
      ) : post.noJob ? (
        <div className="rounded-card px-2.5 py-2 text-[11.5px]" style={{ background: "#FBF6EC", color: "#8A6D1E" }}>
          <span className="font-bold">ยังไม่มีใบงาน</span> — ยังไม่มีใครเปิดงาน Graphic/VDO ให้โพสต์นี้
        </div>
      ) : (
        post.jobs.map((j) => <JobTrack key={j.id} job={j} />)
      )}

      <div className="flex items-center gap-2 flex-wrap text-[10.5px] pt-0.5 border-t border-line4">
        <Chip label="Caption" value={post.captionStatus} owner={post.captionOwner} />
        {post.waitingOn && (
          <span className="text-[11px] font-semibold" style={{ color: "#B3641E" }}>
            ⏳ รอ {post.waitingOn.who} · {post.waitingOn.what}
          </span>
        )}
      </div>
    </div>
  );
}

export function Chip({ label, value, owner }: { label: string; value: string; owner?: string }) {
  return (
    <span className="rounded-pill px-2 py-[2px] bg-ivory text-faint whitespace-nowrap">
      {label}: <span className="font-bold text-muted">{value}</span>
      {owner && <span className="text-faint"> · {owner}</span>}
    </span>
  );
}

/* ── รางการผลิตของใบงานหนึ่งใบ ─────────────────────────────────────────── */

const STEP_DOT: Record<ProductionStep["state"], { fill: string; ring: string }> = {
  done: { fill: "#5D9E35", ring: "#DCECB4" },
  active: { fill: "#4D61D6", ring: "#D6DCFF" },
  waiting: { fill: "#B78E2D", ring: "#F4E0AA" },
  skipped: { fill: "#D8D5E2", ring: "#EFEDF4" },
};

export function JobTrack({ job }: { job: TrackerJob }) {
  const late = job.urgency === "overdue";
  return (
    <div className="rounded-card border border-line4 p-2.5 bg-ivory/40">
      <div className="flex items-center justify-between gap-2 mb-2">
        <Link href={workLink.graphic(job.id)} className="text-[11.5px] font-bold text-muted hover:text-accent truncate flex items-center gap-1">
          {job.kindLabel}
          <ExternalLink size={10} className="shrink-0 opacity-60" />
        </Link>
        <span className="text-[10.5px] shrink-0" style={{ color: late ? "#B33A2E" : "#8A879A", fontWeight: late ? 700 : 500 }}>
          {job.dueIso ? `due ${thaiDate(job.dueIso)}` : "ไม่มีกำหนด"}
        </span>
      </div>

      {/* ราง: จุดต่อจุดตามลำดับจริงของงานใบนี้ — งานภาพนิ่งมี 2 จุด งานถ่ายมี 4 */}
      <div className="flex items-start">
        {job.steps.map((step, i) => {
          const dot = STEP_DOT[step.state];
          const isCurrent = job.current?.key === step.key;
          return (
            <div key={step.key} className="flex-1 min-w-0 flex flex-col items-center">
              <div className="flex items-center w-full">
                <span className={clsx("h-[2px] flex-1", i === 0 && "opacity-0")} style={{ background: dot.ring }} />
                <span
                  title={`${step.label} · ${step.detail}`}
                  className="w-[11px] h-[11px] rounded-full shrink-0"
                  style={{ background: dot.fill, boxShadow: isCurrent ? `0 0 0 3px ${dot.ring}` : undefined }}
                />
                <span
                  className={clsx("h-[2px] flex-1", i === job.steps.length - 1 && "opacity-0")}
                  style={{ background: job.steps[i + 1] ? STEP_DOT[job.steps[i + 1].state].ring : dot.ring }}
                />
              </div>
              <span
                className="text-[9.5px] mt-1 text-center leading-tight truncate w-full px-[2px]"
                style={{ color: isCurrent ? "#17172A" : "#8A879A", fontWeight: isCurrent ? 700 : 500 }}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px]">
        <span className="truncate" style={{ color: hasDesigner(job) ? "#6F6A86" : "#B3641E", fontWeight: hasDesigner(job) ? 500 : 700 }}>
          {hasDesigner(job) ? job.designer : "ยังไม่มีคนถือ"}
        </span>
        <span className="text-faint shrink-0">
          {job.progress.total > 0 ? `${job.progress.approved}/${job.progress.total} อนุมัติ` : job.stage}
        </span>
      </div>

      {job.blockers.length > 0 && (
        <div className="mt-1.5 text-[10.5px] font-bold" style={{ color: "#B33A2E" }}>🔴 {job.blockers[0]}</div>
      )}
    </div>
  );
}

/** ใบงานที่ผูกกับโพสต์ไหนไม่ได้ ไม่ซ่อน — ของจริงที่มีคนทำอยู่ */
export function LooseJobCard({ job }: { job: TrackerJob }) {
  return (
    <div className="border border-dashed border-line2 rounded-card p-[13px] flex flex-col gap-2.5 bg-ivory/30">
      <div>
        <div className="text-[11px] font-bold text-faint">ใบงานที่ยังไม่ผูกกับโพสต์</div>
        <Link href={workLink.graphic(job.id)} className="text-[13px] font-bold text-ink hover:text-accent block truncate">
          {job.title}
        </Link>
        {job.code && <div className="text-[10.5px] text-faint font-mono">{job.code}</div>}
      </div>
      <JobTrack job={job} />
    </div>
  );
}
