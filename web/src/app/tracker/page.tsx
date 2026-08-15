"use client";

/* Work Tracker — แคมเปญ → โพสต์ → งาน Graphic/VDO
 *
 * ต่างจาก /status ตรงที่หน้านั้นวาง Content กับ Graphic ไว้คนละ lane ตอบได้ว่า
 * "มีงานอะไรบ้าง" แต่ตอบไม่ได้ว่า "โพสต์วันที่ 10 อาร์ตเวิร์กถึงไหนแล้ว"
 * หน้านี้ผูกสองอย่างเข้าด้วยกันเป็นการ์ดใบเดียวต่อโพสต์ แล้วกางรางการผลิต
 * (บรีฟ → Storyboard → ถ่าย → ตัดต่อ/อาร์ตเวิร์ก) ให้เห็นพร้อมกันทั้งเดือน
 * โดยไม่ต้องเปิด drawer ทีละใบ
 *
 * กติกาที่ตั้งใจ: ทุกอย่างบนหน้านี้อ่านอย่างเดียว กดแล้วเด้งไปแก้ที่หน้าเจ้าของ
 * โมดูล — สถานะเดียวกันแก้ได้สองที่คือวิธีที่ตัวเลขสองหน้าเริ่มไม่ตรงกัน */

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { Segmented } from "@/components/ui/Segmented";
import { CampaignSection, Kpi } from "@/components/tracker/TrackerCards";
import { BrandFilterValue } from "@/lib/brands";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { useRole } from "@/lib/role";
import { HEALTH_META, HEALTH_ORDER, type Health } from "@/lib/data/statusBoard";
import { TrackerCampaign, UNASSIGNED, buildTracker, filterMonth, summarise } from "@/lib/data/tracker";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { fetchContent } from "@/lib/db/content";
import { fetchGraphics } from "@/lib/db/graphic";

/** เดือนที่เลือกได้: เดือนนี้ ±3 พอครอบคลุมงานที่วางล่วงหน้าจริง */
function monthOptions(todayIso: string) {
  const [y, m] = todayIso.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - 2 + i, 1));
    return {
      value: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString("th-TH", { month: "short", year: "2-digit", timeZone: "UTC" }),
    };
  });
}

export default function WorkTrackerPage() {
  const brandVisibility = useBrandVisibility();
  const { can } = useRole();
  // กั้นราย lane แบบเดียวกับ /status: โพสต์คือกระดูกสันหลังของหน้า (route gate
  // อยู่ที่ Content) ส่วนรายละเอียดใบงานเป็นของโมดูล Graphic
  //
  // ไม่มีสิทธิ์ Graphic = ไม่ fetch ใบงานเลย ไม่ใช่ fetch มาแล้วซ่อนทีหลัง —
  // RLS บนตารางนี้อนุญาต staff ที่ login แล้วทุกคน ไม่รู้จัก matrix ใน Settings
  // ฝั่ง client จึงเป็นด่านเดียวที่มี (เหตุผลเดียวกับที่ /status เขียนไว้)
  const canSeeJobs = can("Graphic");

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const months = useMemo(() => monthOptions(today), [today]);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [health, setHealth] = useState<Health | "all">("all");
  const [lateOnly, setLateOnly] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [all, setAll] = useState<TrackerCampaign[]>([]);

  // สร้างต้นไม้จากโพสต์ "ทุกเดือน" แล้วค่อยกรองเดือนทีหลัง — ถ้ากรองก่อน
  // ใบงานที่ผูกกับโพสต์เดือนอื่นจะจับคู่ไม่เจอ แล้วไปโผล่เป็นใบลอยทั้งที่มีโพสต์อยู่
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchCampaigns(),
      fetchContent(),
      canSeeJobs ? fetchGraphics() : Promise.resolve([]),
    ])
      .then(([campaigns, content, graphics]) => {
        if (!alive) return;
        setAll(buildTracker(
          campaigns.map((c) => ({ id: c.id, name: c.name, b: c.b, status: c.status })),
          content, graphics, today,
        ));
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [canSeeJobs, today]);

  const groups = useMemo(() => {
    const byMonth = filterMonth(all, month);
    return byMonth
      .map((g) => ({
        ...g,
        posts: g.posts.filter((p) =>
          (brand === "all" || p.brand === brand)
          && brandVisibility.isVisible(p.brand)
          && (health === "all" || p.health === health)
          && (!lateOnly || p.urgency === "overdue" || p.jobsOverdue > 0)),
        looseJobs: (brand === "all" && health === "all" && !lateOnly) ? g.looseJobs : [],
      }))
      .filter((g) => g.posts.length > 0 || g.looseJobs.length > 0)
      .filter((g) => g.campaignId === UNASSIGNED || !g.brand || brandVisibility.isVisible(g.brand));
  }, [all, month, brand, health, lateOnly, brandVisibility]);

  const s = useMemo(() => summarise(groups), [groups]);

  return (
    <>
      <PageHeader
        eyebrow="QA"
        title="Work Tracker"
        subtitle="งาน Graphic และ VDO ของทุกโพสต์ ถึงไหนแล้ว รอใครอยู่ — เรียงตามแคมเปญ"
        right={loading ? "กำลังโหลด…" : `${s.posts} โพสต์ · ${s.jobs} ใบงาน`}
      />

      <div className="bg-surface border border-line rounded-cardLg p-4 mb-3">
        <div className="flex flex-wrap items-center gap-3">
          <BrandFilter value={brand} onChange={setBrand} />
          <Segmented value={month} onChange={setMonth} options={months} />
          <Segmented
            value={health}
            onChange={(v) => setHealth(v as Health | "all")}
            options={[
              { value: "all", label: "ทุกสถานะ" },
              ...HEALTH_ORDER.map((h) => ({ value: h, label: HEALTH_META[h].label })),
            ]}
          />
        </div>
      </div>

      {/* ไม่มีสิทธิ์ Graphic = ใบงานไม่ได้ถูกดึงมาเลย ต้องบอกตรง ๆ ไม่งั้นการ์ด
          ทุกใบจะขึ้นว่า "ยังไม่มีใบงาน" ซึ่งเป็นคนละเรื่องกับ "คุณดูไม่ได้" */}
      {!canSeeJobs && (
        <div className="rounded-card border px-4 py-3 mb-3 text-[12px]" style={{ background: "#F4F2F8", borderColor: "#E6E1EF", color: "#6F6A86" }}>
          บทบาทของคุณไม่มีสิทธิ์โมดูล Graphic — หน้านี้จึงแสดงเฉพาะแผนคอนเทนต์ ไม่มีรายละเอียดใบงานและสถานะการผลิต
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {canSeeJobs && (
            <Kpi
              label="ใบงานเลยกำหนด"
              value={s.jobsOverdue}
              fg="#B33A2E" bg="#FFF5F4" border="#F5C8C4"
              // ตัวเลขที่ปฏิทินโพสต์มองไม่เห็น: ใบงานเลย due ของตัวเองไปแล้ว
              // ทั้งที่วันโพสต์ยังไม่มาถึง กดแล้วกรองเหลือเฉพาะพวกนี้
              hint="ใบงานเลย due แล้ว แม้โพสต์ยังไม่ถึงวันลง"
              active={lateOnly}
              onClick={() => setLateOnly((v) => !v)}
            />
          )}
          <Kpi label="โพสต์เลยวันลง" value={s.overdue} fg="#B3641E" bg="#FFF7ED" border="#F0C89B" hint="ถึงวันลงแล้วแต่ยังไม่เสร็จ" />
          {canSeeJobs && <Kpi label="ยังไม่มีใบงาน" value={s.noJob} fg="#8A6D1E" bg="#FBF6EC" border="#EADBC1" hint="โพสต์ที่ยังไม่มีใครเปิดงานให้" />}
          {canSeeJobs && <Kpi label="ยังไม่มีคนถือ" value={s.unassigned} fg="#6F6A86" bg="#F4F2F8" border="#E6E1EF" hint="มีใบงานแล้วแต่ยังไม่ระบุ designer" />}
        </div>
      )}

      {loading ? (
        <div className="bg-surface border border-line rounded-cardLg py-16 text-center text-[13px] text-faint">
          กำลังต่อโพสต์เข้ากับใบงาน…
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-surface border border-line rounded-cardLg py-16 text-center">
          <div className="text-[15px] font-bold text-ink">ไม่มีงานตรงกับตัวกรอง</div>
          <div className="text-[13px] text-faint mt-1">ลองเปลี่ยนเดือน หรือเอาตัวกรองสถานะออก</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <CampaignSection
              key={g.campaignId}
              group={g}
              showJobs={canSeeJobs}
              collapsed={open[g.campaignId] === false}
              onToggle={() => setOpen((p) => ({ ...p, [g.campaignId]: p[g.campaignId] === false }))}
            />
          ))}
        </div>
      )}
    </>
  );
}

