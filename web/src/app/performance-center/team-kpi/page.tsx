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
  scorePerson,
  summarize,
} from "@/lib/data/teamKpi";
import { KpiSignals, kpiSignals, signalsFor, totalSignals } from "@/lib/data/teamKpiSignals";
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

  const months = useMemo(() => recentMonths(new Date()), []);
  const [month, setMonth] = useState(months[0]);
  const [review, setReview] = useState<TeamKpiMonth>(() => emptyMonth(months[0]));
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

  // Counted-for-you numbers: revisions and lateness per person, this month.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const signals = useMemo(() => kpiSignals(graphics, month, today), [graphics, month, today]);

  const results = useMemo(
    () => review.people.map((person) => scorePerson(person, review.inputs)),
    [review.people, review.inputs],
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
        subtitle="ประเมิน KPI รายเดือนตามตรรกะเดียวกับชีท KPI: Achievement% → cap 120% → คูณน้ำหนัก → KPI Score → multiplier · หน้านี้แสดงผลงานอย่างเดียว ไม่มีตัวเลขเงินเดือนหรือโบนัส"
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
            canEdit={canEdit}
            onPatch={patchInput}
            onRemove={removePerson}
          />
          <PersonGroup
            title="KOL Specialist"
            hint="ประเมินด้วยเกณฑ์ของตัวเอง — ไม่ถูกนับรวมในค่าเฉลี่ยทีม Creative"
            results={side}
            signals={signals}
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
  title, hint, results, signals, canEdit, onPatch, onRemove,
}: {
  title: string;
  hint: string;
  results: PersonResult[];
  signals: KpiSignals[];
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
            canEdit={canEdit} onPatch={onPatch} onRemove={onRemove} />
        ))}
      </div>
    </section>
  );
}

function PersonCard({
  result, signals, canEdit, onPatch, onRemove,
}: {
  result: PersonResult;
  signals: KpiSignals | null;
  canEdit: boolean;
  onPatch: (personId: string, kpiName: string, patch: Partial<KpiInput>) => void;
  onRemove: (id: string) => void;
}) {
  const { person, rows, score, complete, multiplier: mult, band: tone } = result;
  const style = BAND_STYLE[tone];
  const defs = kpisFor(person.position);
  // The judged KPI the counted on-time figure can fill in, when the position has one.
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-faint">ตัวเลขที่ระบบนับให้เดือนนี้</div>
            {onTimeKpi && signals.onTimeRate !== null && canEdit && (
              <button
                onClick={() => onPatch(person.id, onTimeKpi.name, { score: Number(signals.onTimeRate!.toFixed(1)) })}
                className="inline-flex items-center gap-1 rounded-pill border border-[#BCEBE6] bg-[#E3F7F5] px-3 py-1 text-[11.5px] font-bold text-[#0B7F7A]"
              >
                <Wand2 size={13} /> ใช้ {pct(signals.onTimeRate, 0)} เป็นคะแนน {onTimeKpi.name}
              </button>
            )}
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-5">
            <MiniStat label="งานครบกำหนด" value={`${signals.due}`} hint={signals.pending ? `ยังไม่ถึงกำหนด ${signals.pending}` : undefined} />
            <MiniStat label="ส่งตรงเวลา" value={pct(signals.onTimeRate, 0)} hint={signals.onTime + signals.late ? `${signals.onTime} ตรง · ${signals.late} สาย` : "ยังสรุปไม่ได้"} />
            <MiniStat label="สาย" value={signals.late ? `${signals.late} ชิ้น` : "—"} hint={signals.late ? `เฉลี่ย ${signals.avgDaysLate.toFixed(1)} วัน · มากสุด ${signals.maxDaysLate}${signals.stillOpen ? ` · ค้าง ${signals.stillOpen}` : ""}` : "ไม่มีงานสาย"} />
            <MiniStat label="ถูกขอแก้" value={`${signals.revisions} ครั้ง`} hint={`${signals.piecesRevised} ชิ้น`} />
            <MiniStat label="ผ่านรวดเดียว" value={pct(signals.cleanRate, 0)} hint={signals.pieces ? `จาก ${signals.pieces} ชิ้นอนุมัติ` : "ยังไม่มีชิ้นอนุมัติ"} />
          </div>
        </div>
      ) : (
        <div className="border-b border-line px-5 py-3 text-[11.5px] font-semibold text-faint">
          ไม่พบงานของชื่อนี้ใน Graphic Request เดือนนี้ — ตัวเลขนับให้ไม่ได้ ต้องให้คะแนนเอง (ชื่อในหน้านี้ต้องตรงกับชื่อ designer บนบอร์ด)
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
              const manual = def.direction === "Manual";
              return (
                <tr key={def.name} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-bold text-ink">{def.name}</td>
                  <td className="px-4 py-3 text-faint">{def.focus}</td>
                  <td className="px-4 py-3 text-faint">{(def.weight * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3 text-faint">{def.direction}</td>
                  <td className="px-4 py-3 text-right">
                    {manual ? (
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
                      value={manual ? input.score ?? null : input.actual ?? null}
                      suffix={manual ? "%" : undefined}
                      disabled={!canEdit}
                      onChange={(value) => onPatch(person.id, def.name, manual ? { score: value } : { actual: value })}
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
  value, onChange, disabled, suffix,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        value={value === null ? "" : value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="w-[96px] rounded-[10px] border border-line2 bg-white px-2 py-[6px] text-right text-[12.5px] font-semibold text-ink outline-none disabled:bg-ivory disabled:text-faint"
        placeholder="—"
      />
      {suffix && <span className="text-[11.5px] font-semibold text-faint">{suffix}</span>}
    </span>
  );
}
