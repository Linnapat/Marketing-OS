"use client";

// Team KPI review — Creative team (KOL Specialist reviewed alongside, counted
// separately). Same chain the KPI sheet runs: Target/Actual or a manual score →
// Achievement% → capped at 120% → × weight → KPI Score → multiplier band.
// Performance only: no salary, no bonus on this screen.

import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save, Trash2, TriangleAlert, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useRole } from "@/lib/role";
import {
  ALL_POSITIONS,
  CREATIVE_POSITIONS,
  KpiBand,
  KpiInput,
  KpiPerson,
  PersonResult,
  TeamKpiMonth,
  emptyMonth,
  inputKey,
  isCreativePosition,
  isSidePosition,
  kpisFor,
  recentMonths,
  monthKeyOf,
  scorePerson,
  summarize,
} from "@/lib/data/teamKpi";
import { KpiSignals, kpiSignals, signalsFor, totalSignals } from "@/lib/data/teamKpiSignals";
import { KolKpiRow, KolKpiSignals, kolKpiSignals, kolTeamSignals, kolSignalsFor } from "@/lib/data/kolKpiSignals";
import { fetchKolKpiRows } from "@/lib/db/kolScorecard";
import { baht } from "@/lib/format";
import { AutoValue, autoInputs, isOverridden, mergeInputs } from "@/lib/data/teamKpiAuto";
import { fetchTeamKpiMonth, saveTeamKpiMonth } from "@/lib/db/teamKpi";
import { fetchGraphics } from "@/lib/db/graphic";
import { Graphic } from "@/lib/data/graphic";

const ACCENT = "#0EA5A0";
const BAND_STYLE: Record<KpiBand, { fg: string; bg: string; label: string }> = {
  none: { fg: "#6F6A86", bg: "#F4F2F8", label: "ยังไม่ประเมิน" },
  low: { fg: "#C0392B", bg: "#FDECEA", label: "ต่ำกว่าเกณฑ์" },
  near: { fg: "#B78E2D", bg: "#FFF3D7", label: "เกือบถึงเป้า" },
  on: { fg: "#2E8B7A", bg: "#E3F5F0", label: "ถึงเป้า" },
  over: { fg: "#0B7F7A", bg: "#E3F7F5", label: "เกินเป้า" },
};

const pct = (value: number | null, digits = 1) => (value === null ? "—" : `${value.toFixed(digits)}%`);
const monthLabel = (month: string) => {
  const [y, m] = month.split("-");
  const names = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${names[Number(m) - 1] ?? m} ${Number(y) + 543}`;
};
const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function TeamKpiPage() {
  const { role } = useRole();
  // Reviews are the CMO's to write — everyone else reads. The DB enforces the
  // same rule (team_kpi.sql is admin-only); this only keeps the UI honest.
  const canEdit = role === "CMO";

  // The team plans two months ahead, so the picker has to reach forward — it
  // only walked backwards, which meant the months actually being planned could
  // not be opened at all. Default still lands on the CURRENT month: the list
  // now starts in the future, and months[0] would open a month nobody asked for.
  const months = useMemo(() => recentMonths(new Date(), 12, 2), []);
  const thisMonth = useMemo(() => monthKeyOf(new Date()), []);
  const [month, setMonth] = useState(thisMonth);
  const [review, setReview] = useState<TeamKpiMonth>(() => emptyMonth(thisMonth));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [shared, setShared] = useState(true);
  const [newName, setNewName] = useState("");
  const [newPosition, setNewPosition] = useState<string>(CREATIVE_POSITIONS[0]);
  // Graphic Requests are the source of the counted numbers (revisions, lateness).
  // Loaded once: they are re-sliced per month in memory rather than re-fetched.
  const [graphics, setGraphics] = useState<Graphic[]>([]);
  const [kolRows, setKolRows] = useState<KolKpiRow[]>([]);

  const load = async (target: string) => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const { review: loaded, shared: isShared } = await fetchTeamKpiMonth(target);
      setReview(loaded);
      setShared(isShared);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "อ่านข้อมูล KPI ไม่ได้");
      setReview(emptyMonth(target));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(month); }, [month]);
  useEffect(() => { fetchGraphics().then(setGraphics).catch(() => {}); }, []);
  useEffect(() => { fetchKolKpiRows().then(setKolRows).catch(() => {}); }, []);

  // Counted-for-you numbers: revisions and lateness per person, this month.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const signals = useMemo(() => kpiSignals(graphics, month, today), [graphics, month, today]);
  // The KOL side of the review had no counted numbers at all, so it was the one
  // group assessed purely from memory.
  const kolSignals = useMemo(() => kolKpiSignals(kolRows, month), [kolRows, month]);
  const kolTeam = useMemo(() => kolTeamSignals(kolRows, month), [kolRows, month]);

  // Everything the system can work out on its own, per person. The reviewer's
  // typed values are merged on top — kept separate so what is SAVED stays the
  // judgement, and derived numbers re-read from live data every time.
  const autoByPerson = useMemo(() => {
    const map: Record<string, Record<string, AutoValue>> = {};
    for (const person of review.people) {
      map[person.id] = autoInputs(person.id, kpisFor(person.position), signalsFor(person.name, signals));
    }
    return map;
  }, [review.people, signals]);

  const effectiveInputs = useMemo(
    () => mergeInputs(Object.assign({}, ...Object.values(autoByPerson)), review.inputs),
    [autoByPerson, review.inputs],
  );

  const results = useMemo(
    () => review.people.map((person) => scorePerson(person, effectiveInputs)),
    [review.people, effectiveInputs],
  );
  const creative = useMemo(() => results.filter((r) => isCreativePosition(r.person.position)), [results]);
  const side = useMemo(() => results.filter((r) => isSidePosition(r.person.position)), [results]);
  const teamSummary = useMemo(() => summarize(creative), [creative]);
  // Only the people actually being reviewed — the board also carries agency and
  // other designers, and their work is not this team's number.
  const teamSignals = useMemo(
    () => totalSignals(creative.map((r) => signalsFor(r.person.name, signals)).filter(Boolean) as KpiSignals[]),
    [creative, signals],
  );

  const patchInput = (personId: string, kpiName: string, patch: Partial<KpiInput>) => {
    setReview((prev) => {
      const key = inputKey(personId, kpiName);
      return { ...prev, inputs: { ...prev.inputs, [key]: { ...(prev.inputs[key] ?? {}), ...patch } } };
    });
    setDirty(true);
  };

  const addPerson = () => {
    const name = newName.trim();
    if (!name) return;
    const person: KpiPerson = { id: newId(), name, position: newPosition };
    setReview((prev) => ({ ...prev, people: [...prev.people, person] }));
    setNewName("");
    setDirty(true);
  };

  const removePerson = (id: string) => {
    setReview((prev) => ({
      ...prev,
      people: prev.people.filter((p) => p.id !== id),
      // Drop the person's rows too, so a re-added name starts clean instead of
      // inheriting last month's numbers through a stale key.
      inputs: Object.fromEntries(Object.entries(prev.inputs).filter(([key]) => !key.startsWith(`${id}::`))),
    }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { shared: isShared, savedAt } = await saveTeamKpiMonth(review);
      setShared(isShared);
      setDirty(false);
      setReview((prev) => ({ ...prev, updatedAt: savedAt }));
      setNotice(isShared
        ? "บันทึกแล้ว — ทีมที่มีสิทธิ์เห็นข้อมูลชุดเดียวกัน"
        : "บันทึกไว้ในเครื่องนี้เท่านั้น — ยังไม่ได้รัน supabase/team_kpi.sql จึงยังไม่ได้แชร์ให้เครื่องอื่น");
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="QA"
        title="Team KPI — Creative"
        subtitle="ประเมิน KPI รายเดือนจากการส่งงานจริงบนบอร์ด: งานที่ครบกำหนดในเดือนนั้น → ส่งทันกำหนดกี่ชิ้น สายกี่วัน (งานที่ยังไม่จบและเลยกำหนดแล้ว นับเป็นสาย) → ถูกขอแก้กี่ครั้ง · หน้านี้แสดงผลงานอย่างเดียว ไม่มีตัวเลขเงินเดือนหรือโบนัส"
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-[12px] border border-line2 bg-white px-3 py-2 text-[12.5px] font-bold text-ink outline-none"
            >
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <button
              onClick={() => load(month)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-[12px] border border-[#BCEBE6] bg-[#E3F7F5] px-4 py-2 text-[12.5px] font-bold text-[#0B7F7A] disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            {canEdit && (
              <button
                onClick={save}
                disabled={saving || loading || !dirty}
                className="inline-flex items-center gap-2 rounded-[12px] px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-40"
                style={{ background: ACCENT }}
              >
                <Save size={15} /> {saving ? "กำลังบันทึก…" : dirty ? "บันทึก" : "บันทึกแล้ว"}
              </button>
            )}
          </div>
        }
      />

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-[16px] border border-status-red/30 bg-white px-4 py-3 text-[12.5px] font-semibold text-status-red">
          <TriangleAlert size={16} className="mt-[1px] shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-[16px] border border-line bg-surface px-4 py-3 text-[12.5px] font-semibold text-muted">
          {notice}
        </div>
      )}
      {!canEdit && (
        <div className="mt-4 rounded-[16px] border border-line bg-surface px-4 py-3 text-[12.5px] font-semibold text-muted">
          โหมดอ่านอย่างเดียว — การประเมินแก้ไขได้เฉพาะ CMO
        </div>
      )}

      {/* ── Team roll-up (Creative only) ────────────────────────────── */}
      <section className="mt-4 rounded-[26px] border border-[#BCEBE6] bg-[#E3F7F5] p-5 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[12px] font-extrabold uppercase tracking-[0.13em] text-[#0B7F7A]">Creative team · {monthLabel(month)}</div>
            <div className="mt-1 text-[20px] font-extrabold text-ink">ทีม Creative เดือนนี้ทำได้แค่ไหน</div>
            {/* The scoring chain moved off the page title, but it still has to be
                readable where the scores themselves are shown. */}
            <div className="mt-1 text-[11.5px] font-semibold text-[#0B7F7A]">คิดคะแนนแบบเดียวกับชีท KPI: Achievement% → cap 120% → คูณน้ำหนัก → KPI Score → multiplier</div>
          </div>
          <div className="text-[11.5px] font-semibold text-[#0B7F7A]">
            {shared ? "ข้อมูลใช้ร่วมกันทั้งทีม" : "ยังเก็บในเครื่องนี้ (ยังไม่ได้รัน migration)"}
            {review.updatedAt ? ` · แก้ล่าสุด ${new Date(review.updatedAt).toLocaleString("th-TH")}` : ""}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <MetricCard
            label="KPI Score เฉลี่ย"
            value={teamSummary.scored ? pct(teamSummary.avgScore) : "—"}
            hint={teamSummary.scored ? `จาก ${teamSummary.scored} คนที่ประเมินครบ` : "ยังไม่มีใครประเมินครบ"}
          />
          <MetricCard label="ถึงเป้า (100%+)" value={`${teamSummary.onTarget}`} hint={`จาก ${teamSummary.people} คนในทีม`} />
          <MetricCard label="ต่ำกว่า 90%" value={`${teamSummary.atRisk}`} hint="ได้ multiplier 0 ตามเกณฑ์ชีท" />
          <MetricCard label="ยังประเมินไม่ครบ" value={`${teamSummary.incomplete}`} hint="คนที่ยังกรอกไม่ครบทุก KPI" />
          <MetricCard label="ความครบของข้อมูล" value={pct(teamSummary.completeness * 100, 0)} hint="นับรายแถว KPI" />
        </div>

        {teamSummary.byFocus.length > 0 && (
          <div className="mt-4 rounded-[20px] border border-[#BCEBE6] bg-white p-4">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-faint">จุดแข็ง / จุดอ่อน ตาม KPI Focus</div>
            <div className="mt-3 space-y-2">
              {teamSummary.byFocus.map((f) => (
                <div key={f.focus} className="flex items-center gap-3">
                  <div className="w-[110px] shrink-0 text-[12.5px] font-bold text-ink">{f.focus}</div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(2, Math.min(100, (f.avg / 120) * 100))}%`, background: f.avg >= 100 ? ACCENT : "#E08A34" }}
                    />
                  </div>
                  <div className="w-[110px] shrink-0 text-right text-[12px] font-semibold text-faint">
                    {pct(f.avg)} · {f.rows} KPI
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Counted from Graphic Requests — the reviewer shouldn't tally these by hand. */}
        <div className="mt-3 rounded-[20px] border border-[#BCEBE6] bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-faint">ตัวเลขที่ระบบนับให้ · จาก Graphic Request</div>
            <div className="text-[11px] font-semibold text-faint">นับเฉพาะคนที่อยู่ในรอบประเมินเดือนนี้</div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-5">
            <MiniStat label="งานครบกำหนดเดือนนี้" value={`${teamSignals.due}`} hint={teamSignals.pending ? `ยังไม่ถึงกำหนดอีก ${teamSignals.pending}` : "ถึงกำหนดครบแล้ว"} />
            <MiniStat label="ส่งตรงเวลา" value={pct(teamSignals.onTimeRate, 0)} hint={teamSignals.onTime + teamSignals.late ? `${teamSignals.onTime} ตรง · ${teamSignals.late} สาย` : "ยังไม่มีงานที่สรุปได้"} />
            <MiniStat label="สายเฉลี่ย" value={teamSignals.late ? `${teamSignals.avgDaysLate.toFixed(1)} วัน` : "—"} hint={teamSignals.stillOpen ? `ค้างเลยกำหนด ${teamSignals.stillOpen} · มากสุด ${teamSignals.maxDaysLate} วัน` : teamSignals.late ? `มากสุด ${teamSignals.maxDaysLate} วัน` : "ไม่มีงานสาย"} />
            <MiniStat label="ถูกขอแก้" value={`${teamSignals.revisions} ครั้ง`} hint={`${teamSignals.piecesRevised} ชิ้นที่ต้องแก้`} />
            <MiniStat label="ผ่านรวดเดียว" value={pct(teamSignals.cleanRate, 0)} hint={teamSignals.pieces ? `จาก ${teamSignals.pieces} ชิ้นที่อนุมัติ` : "ยังไม่มีชิ้นงานอนุมัติ"} />
          </div>
        </div>

        {/* The KOL month, counted the same way. Kept as its own strip rather than
            folded into the Creative numbers: different work, different clock. */}
        <div className="mt-3 rounded-[20px] border border-[#F0D3AE] bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-faint">ตัวเลขที่ระบบนับให้ · จากงาน KOL</div>
            <div className="text-[11px] font-semibold text-faint">ทั้งเดือน รวมงานที่ยังไม่ได้ระบุผู้ดูแล</div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-5">
            <MiniStat label="งาน KOL เดือนนี้" value={`${kolTeam.engagements}`} hint={kolTeam.cancelled ? `ยกเลิก ${kolTeam.cancelled}` : "ไม่มีที่ยกเลิก"} />
            <MiniStat label="โพสต์ตรงวันที่นัด" value={pct(kolTeam.onTimeRate, 0)}
              hint={kolTeam.onTime + kolTeam.late ? `${kolTeam.onTime} ตรง · ${kolTeam.late} สายเพราะ KOL` : "ยังไม่มีงานที่ตัดสินได้"} />
            <MiniStat label="ช้าแต่ยังไม่ระบุสาเหตุ" value={`${kolTeam.unattributedLate}`}
              hint={kolTeam.unattributedLate ? "ต้องระบุก่อน ถึงจะรู้ว่าหักคะแนนใคร" : "ระบุครบแล้ว"} />
            <MiniStat label="ปิดผลแล้ว" value={`${kolTeam.resulted - kolTeam.unclosed}/${kolTeam.resulted}`}
              hint={kolTeam.unclosed ? `ค้างสรุปผล ${kolTeam.unclosed} งาน` : "สรุปครบแล้ว"} />
            <MiniStat label="Cost / reach" value={kolTeam.costPerReach != null ? `฿${kolTeam.costPerReach.toFixed(3)}` : "—"}
              hint={kolTeam.totalCost ? `ใช้ไป ${baht(kolTeam.totalCost, { compact: true })}` : "ยังไม่มีค่าใช้จ่าย"} />
          </div>
        </div>
      </section>

      {/* ── Roster ─────────────────────────────────────────────────── */}
      {canEdit && (
        <section className="mt-4 rounded-[22px] border border-line bg-surface p-4 shadow-soft">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-faint">เพิ่มคนที่จะประเมิน</div>
              <div className="mt-1 text-[12px] text-faint">ชื่อพนักงานเก็บอยู่ในฐานข้อมูล ไม่ได้อยู่ในโค้ด — เลือกตำแหน่งให้ตรงกับชุด KPI ที่จะใช้วัด</div>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addPerson(); }}
                placeholder="ชื่อ / ชื่อเล่น"
                className="rounded-[12px] border border-line2 bg-white px-3 py-2 text-[12.5px] font-semibold text-ink outline-none"
              />
              <select
                value={newPosition}
                onChange={(e) => setNewPosition(e.target.value)}
                className="rounded-[12px] border border-line2 bg-white px-3 py-2 text-[12.5px] font-bold text-ink outline-none"
              >
                {ALL_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button
                onClick={addPerson}
                disabled={!newName.trim()}
                className="inline-flex items-center gap-2 rounded-[12px] border border-line2 px-4 py-2 text-[12.5px] font-bold text-ink disabled:opacity-40"
              >
                <Plus size={15} /> เพิ่ม
              </button>
            </div>
          </div>
        </section>
      )}

      {loading ? (
        <div className="mt-4 rounded-[22px] border border-line bg-surface p-6 text-center text-[13px] text-faint">กำลังโหลด…</div>
      ) : (
        <>
          <PersonGroup
            title="ทีม Creative"
            hint="นับรวมในค่าเฉลี่ยของทีมด้านบน"
            results={creative}
            signals={signals}
            autoByPerson={autoByPerson}
            manual={review.inputs}
            canEdit={canEdit}
            onPatch={patchInput}
            onRemove={removePerson}
          />
          <PersonGroup
            title="KOL Specialist"
            hint="ประเมินด้วยเกณฑ์ของตัวเอง — ไม่ถูกนับรวมในค่าเฉลี่ยทีม Creative"
            results={side}
            signals={signals}
            kolSignals={kolSignals}
            variant="kol"
            autoByPerson={autoByPerson}
            manual={review.inputs}
            canEdit={canEdit}
            onPatch={patchInput}
            onRemove={removePerson}
          />
          {results.length === 0 && (
            <div className="mt-4 rounded-[22px] border border-dashed border-line2 bg-surface p-8 text-center text-[13px] text-faint">
              ยังไม่มีคนในรอบประเมินเดือนนี้ — {canEdit ? "เพิ่มชื่อด้านบนเพื่อเริ่ม" : "รอ CMO เพิ่มรายชื่อ"}
            </div>
          )}
        </>
      )}
    </>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[18px] border border-[#BCEBE6] bg-white p-4">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-faint">{label}</div>
      <div className="mt-2 text-[24px] font-extrabold text-ink">{value}</div>
      {hint && <div className="mt-1 text-[11.5px] font-semibold text-faint">{hint}</div>}
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[14px] bg-[#F8F7F3] p-3">
      <div className="text-[11px] font-semibold text-faint">{label}</div>
      <div className="mt-1 text-[17px] font-extrabold text-ink">{value}</div>
      {hint && <div className="mt-[2px] text-[10.5px] font-semibold text-faint">{hint}</div>}
    </div>
  );
}

function PersonGroup({
  title, hint, results, signals, kolSignals = [], variant = "creative",
  autoByPerson, manual, canEdit, onPatch, onRemove,
}: {
  title: string;
  hint: string;
  results: PersonResult[];
  signals: KpiSignals[];
  /** Only the KOL group passes these; Creative rows have none and show nothing. */
  kolSignals?: KolKpiSignals[];
  /** Which empty-state to show when nothing could be counted for this person. */
  variant?: "creative" | "kol";
  autoByPerson: Record<string, Record<string, AutoValue>>;
  manual: Record<string, KpiInput>;
  canEdit: boolean;
  onPatch: (personId: string, kpiName: string, patch: Partial<KpiInput>) => void;
  onRemove: (id: string) => void;
}) {
  if (results.length === 0) return null;
  return (
    <section className="mt-4">
      <div className="flex flex-wrap items-baseline gap-2 px-1">
        <div className="text-[16px] font-extrabold text-ink">{title}</div>
        <div className="text-[12px] text-faint">{hint}</div>
      </div>
      <div className="mt-2 grid gap-3">
        {results.map((result) => (
          <PersonCard key={result.person.id} result={result} signals={signalsFor(result.person.name, signals)}
            kolSignals={kolSignalsFor(result.person.name, kolSignals)} variant={variant}
            auto={autoByPerson[result.person.id] ?? {}} manual={manual}
            canEdit={canEdit} onPatch={onPatch} onRemove={onRemove} />
        ))}
      </div>
    </section>
  );
}

function PersonCard({
  result, signals, kolSignals = null, variant = "creative", auto, manual, canEdit, onPatch, onRemove,
}: {
  result: PersonResult;
  signals: KpiSignals | null;
  kolSignals?: KolKpiSignals | null;
  variant?: "creative" | "kol";
  auto: Record<string, AutoValue>;
  manual: Record<string, KpiInput>;
  canEdit: boolean;
  onPatch: (personId: string, kpiName: string, patch: Partial<KpiInput>) => void;
  onRemove: (id: string) => void;
}) {
  const { person, rows, score, complete, multiplier: mult, band: tone } = result;
  const style = BAND_STYLE[tone];
  const defs = kpisFor(person.position);
  // The judged KPI a counted on-time figure can fill in, when the position has
  // one. Graphic work no longer needs the button — those rows fill themselves
  // (see teamKpiAuto) — but a KOL Specialist's work is not on the Graphic board,
  // so their on-time number still has to be offered rather than counted.
  const onTimeKpi = defs.find((d) => d.direction === "Manual" && /on-time/i.test(d.name));

  return (
    <div className="rounded-[24px] border border-line bg-surface shadow-soft overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <div className="text-[16px] font-extrabold text-ink">{person.name}</div>
          <div className="text-[12px] text-faint">{person.position} · {defs.length} KPI</div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-faint">KPI Score</div>
            <div className="text-[24px] font-extrabold" style={{ color: style.fg }}>{pct(score)}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-faint">Multiplier</div>
            <div className="text-[24px] font-extrabold text-ink">{complete ? `${mult.toFixed(2)}×` : "—"}</div>
          </div>
          <StatusBadge fg={style.fg} bg={style.bg}>{complete ? style.label : "ยังประเมินไม่ครบ"}</StatusBadge>
          {canEdit && (
            <button
              onClick={() => onRemove(person.id)}
              title="เอาออกจากรอบประเมินเดือนนี้"
              className="rounded-[10px] border border-line2 p-2 text-faint hover:text-status-red"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {signals ? (
        <div className="border-b border-line px-5 py-3">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-faint">ตัวเลขที่ระบบนับให้เดือนนี้</div>
          <div className="mt-2 grid gap-2 md:grid-cols-5">
            <MiniStat label="งานครบกำหนด" value={`${signals.due}`} hint={signals.pending ? `ยังไม่ถึงกำหนด ${signals.pending}` : undefined} />
            <MiniStat label="ส่งตรงเวลา" value={pct(signals.onTimeRate, 0)} hint={signals.onTime + signals.late ? `${signals.onTime} ตรง · ${signals.late} สาย` : "ยังสรุปไม่ได้"} />
            <MiniStat label="สาย" value={signals.late ? `${signals.late} ชิ้น` : "—"} hint={signals.late ? `เฉลี่ย ${signals.avgDaysLate.toFixed(1)} วัน · มากสุด ${signals.maxDaysLate}${signals.stillOpen ? ` · ค้าง ${signals.stillOpen}` : ""}` : "ไม่มีงานสาย"} />
            <MiniStat label="ถูกขอแก้" value={`${signals.revisions} ครั้ง`} hint={`${signals.piecesRevised} ชิ้น`} />
            <MiniStat label="ผ่านรวดเดียว" value={pct(signals.cleanRate, 0)} hint={signals.pieces ? `จาก ${signals.pieces} ชิ้นอนุมัติ` : "ยังไม่มีชิ้นอนุมัติ"} />
          </div>
        </div>
      ) : !kolSignals ? (
        // Two different reasons for "no numbers", and telling a KOL specialist
        // their name is missing from the Graphic board helps nobody.
        <div className="border-b border-line px-5 py-3 text-[11.5px] font-semibold text-faint">
          {variant === "kol"
            ? "ยังไม่มีงาน KOL ที่ระบุชื่อนี้เป็นผู้ดูแลในเดือนนี้ — งานที่ยกมาจากชีตไม่มีคอลัมน์ผู้ดูแล ตัวเลขรายคนจะเริ่มนับจากงานที่บันทึกในระบบ"
            : "ไม่พบงานของชื่อนี้ใน Graphic Request เดือนนี้ — ตัวเลขนับให้ไม่ได้ ต้องให้คะแนนเอง (ชื่อในหน้านี้ต้องตรงกับชื่อ designer บนบอร์ด)"}
        </div>
      ) : null}

      {kolSignals && (
        <div className="border-b border-line px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-faint">ตัวเลขที่ระบบนับให้เดือนนี้ · งาน KOL</div>
            {onTimeKpi && kolSignals.onTimeRate !== null && canEdit && (
              <button
                onClick={() => onPatch(person.id, onTimeKpi.name, { score: Number(kolSignals.onTimeRate!.toFixed(1)) })}
                className="inline-flex items-center gap-1 rounded-pill border border-[#F0D3AE] bg-[#FFF3E5] px-3 py-1 text-[11.5px] font-bold text-[#B4622A]"
              >
                <Wand2 size={13} /> ใช้ {pct(kolSignals.onTimeRate, 0)} เป็นคะแนน {onTimeKpi.name}
              </button>
            )}
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-5">
            <MiniStat label="งาน KOL" value={`${kolSignals.engagements}`} hint={kolSignals.cancelled ? `ยกเลิก ${kolSignals.cancelled}` : undefined} />
            <MiniStat label="โพสต์ตรงวันนัด" value={pct(kolSignals.onTimeRate, 0)}
              hint={kolSignals.onTime + kolSignals.late ? `${kolSignals.onTime} ตรง · ${kolSignals.late} สาย` : "ยังสรุปไม่ได้"} />
            <MiniStat label="ยังไม่ระบุสาเหตุที่ช้า" value={`${kolSignals.unattributedLate}`}
              hint={kolSignals.unattributedLate ? "ค้างให้ระบุ" : "ครบแล้ว"} />
            <MiniStat label="ค้างสรุปผล" value={`${kolSignals.unclosed}`}
              hint={kolSignals.resulted ? `จบงาน ${kolSignals.resulted} งาน` : "ยังไม่มีงานจบ"} />
            <MiniStat label="Cost / reach" value={kolSignals.costPerReach != null ? `฿${kolSignals.costPerReach.toFixed(3)}` : "—"}
              hint={kolSignals.totalCost ? baht(kolSignals.totalCost, { compact: true }) : undefined} />
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-[12px]">
          <thead>
            <tr className="bg-ivory text-faint">
              {["KPI", "Focus", "น้ำหนัก", "ทิศทาง", "Target", "Actual / คะแนน", "Achievement", "หลัง cap", "Weighted"].map((h, i) => (
                <th key={h} className={`border-b border-line px-4 py-3 font-extrabold uppercase tracking-[0.08em] ${i < 4 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ def, input, achievement: ach, capped: cap, weighted: w }) => {
              const isManualKpi = def.direction === "Manual";
              const key = inputKey(person.id, def.name);
              const autoValue = auto[key];
              const typed = manual[key];
              const overridden = isOverridden(autoValue, typed);
              return (
                <tr key={def.name} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-bold text-ink">
                    {def.name}
                    {autoValue && (
                      <span
                        title={`${autoValue.source} · ${autoValue.basis}`}
                        className={`ml-2 inline-flex items-center gap-1 rounded-pill px-2 py-[2px] text-[10px] font-bold ${overridden ? "bg-[#FFF3D7] text-[#B78E2D]" : "bg-[#E3F7F5] text-[#0B7F7A]"}`}
                      >
                        <Wand2 size={10} /> {overridden ? "แก้เอง" : "อัตโนมัติ"}
                      </span>
                    )}
                    {!autoValue && (
                      <span className="ml-2 text-[10.5px] font-semibold text-faint">ให้คะแนนเอง</span>
                    )}
                    {autoValue && (
                      <div className="mt-[2px] text-[10.5px] font-semibold text-faint">
                        {autoValue.basis}
                        {overridden && canEdit && (
                          <button
                            onClick={() => onPatch(person.id, def.name, { target: null, actual: null, score: null })}
                            className="ml-2 underline decoration-dotted hover:text-ink"
                          >
                            คืนค่าอัตโนมัติ
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-faint">{def.focus}</td>
                  <td className="px-4 py-3 text-faint">{(def.weight * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3 text-faint">{def.direction}</td>
                  <td className="px-4 py-3 text-right">
                    {isManualKpi ? (
                      <span className="text-faint">—</span>
                    ) : (
                      <NumberCell
                        value={input.target ?? null}
                        disabled={!canEdit}
                        onChange={(value) => onPatch(person.id, def.name, { target: value })}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <NumberCell
                      value={isManualKpi ? input.score ?? null : input.actual ?? null}
                      suffix={isManualKpi ? "%" : undefined}
                      disabled={!canEdit}
                      auto={!!autoValue && !overridden}
                      onChange={(value) => onPatch(person.id, def.name, isManualKpi ? { score: value } : { actual: value })}
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">{pct(ach)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${ach !== null && ach > 120 ? "text-[#B78E2D]" : "text-faint"}`}>
                    {pct(cap)}
                  </td>
                  <td className="px-4 py-3 text-right font-extrabold text-ink">{pct(w)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Number input that keeps "empty" distinct from 0 — a blank KPI is unscored,
 *  and storing 0 for it would read as a genuine miss on the review. */
function NumberCell({
  value, onChange, disabled, suffix, auto,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  suffix?: string;
  /** Filled by the system — tinted so a reviewer can see what they didn't type. */
  auto?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        value={value === null ? "" : value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={`w-[96px] rounded-[10px] border px-2 py-[6px] text-right text-[12.5px] font-semibold outline-none disabled:text-faint ${auto ? "border-[#BCEBE6] bg-[#F2FBFA] text-[#0B7F7A]" : "border-line2 bg-white text-ink disabled:bg-ivory"}`}
        placeholder="—"
      />
      {suffix && <span className="text-[11.5px] font-semibold text-faint">{suffix}</span>}
    </span>
  );
}
