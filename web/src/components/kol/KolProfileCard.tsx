"use client";

// The KOL 360 card — everything we know about one creator in one place:
// who they are, what they cost, every time we booked them, and what came back.
// Rendered full-page at /kol/[id] (shareable, opens in its own tab) and reused
// inside the Library drawer for a quick look without leaving the table.

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { baht } from "@/lib/format";
import { brandName, brandColor } from "@/lib/brands";
import { platformIcon } from "@/lib/platforms";
import { initials, fmtFollow } from "@/lib/data/kol";
import { tierTone } from "@/lib/kolTier";
import { useAuth } from "@/lib/auth";
import {
  fetchKolScorecard, fetchKolEngagements, fetchKolTierBenchmarks,
  fetchKolNotes, addKolNote, deleteKolNote,
  KolScorecardRow, KolEngagementRow, KolTierBenchmark, KolNote,
} from "@/lib/db/kolScorecard";

/** Reach we bought per baht spent, versus what this tier normally costs us. */
function cprVerdict(cpr: number | null, bench: number | null) {
  if (cpr == null || bench == null || bench <= 0) return null;
  const ratio = cpr / bench;
  if (ratio <= 0.6) return { label: "ถูกกว่าค่าเฉลี่ยเทียร์มาก", tone: "good" as const };
  if (ratio <= 1.1) return { label: "อยู่ในเกณฑ์ปกติของเทียร์", tone: "ok" as const };
  if (ratio <= 2) return { label: "แพงกว่าค่าเฉลี่ยเทียร์", tone: "warn" as const };
  return { label: `แพงกว่าค่าเฉลี่ยเทียร์ ${ratio.toFixed(1)} เท่า`, tone: "bad" as const };
}

const TONE = {
  good: { bg: "#EEF4EE", border: "#CFE4C2", fg: "#3F6A34" },
  ok:   { bg: "#F4F6FA", border: "#D5DEEF", fg: "#3E5C9A" },
  warn: { bg: "#FBF6EC", border: "#EADBC1", fg: "#8A6D1E" },
  bad:  { bg: "#FFF5F4", border: "#F5C8C4", fg: "#B33A2E" },
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.05em] text-faint font-bold">{label}</div>
      <div className="text-[17px] font-extrabold text-ink mt-[2px]">{value}</div>
      {hint && <div className="text-[11px] text-faint mt-[1px]">{hint}</div>}
    </div>
  );
}

export function KolProfileCard({ kolId, compact = false }: { kolId: string; compact?: boolean }) {
  const [row, setRow] = useState<KolScorecardRow | null>(null);
  const [history, setHistory] = useState<KolEngagementRow[]>([]);
  const [bench, setBench] = useState<KolTierBenchmark[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([fetchKolScorecard(kolId), fetchKolEngagements(kolId), fetchKolTierBenchmarks()])
      .then(([r, h, b]) => { if (!alive) return; setRow(r); setHistory(h); setBench(b); setLoading(false); })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [kolId]);

  if (loading) return <div className="px-5 py-10 text-center text-[13px] text-faint">Loading…</div>;
  if (!row) return <div className="px-5 py-10 text-center text-[13px] text-faint">ไม่พบ KOL รายนี้</div>;

  const tierBench = bench.find((b) => b.tier === row.tier)?.cost_per_reach ?? null;
  const verdict = cprVerdict(row.cost_per_reach, tierBench);
  const channels = (row.channels ?? []).filter((c) => c.platform);
  const rate = row.rate_min_thb != null
    ? (row.rate_max_thb != null && row.rate_max_thb !== row.rate_min_thb
        ? `${baht(row.rate_min_thb, { compact: true })}–${baht(row.rate_max_thb, { compact: true })}`
        : baht(row.rate_min_thb, { compact: true }))
    : "—";

  return (
    <div className="flex flex-col gap-4">
      {/* Identity */}
      <div className="flex items-start gap-3 flex-wrap">
        <span className="w-12 h-12 rounded-full flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0" style={{ background: "#6b6258" }}>
          {initials(row.display_name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[18px] font-extrabold text-ink truncate">{row.display_name}</div>
          <div className="text-[12px] text-faint mt-[4px] flex items-center gap-2 flex-wrap">
            {row.tier && (
              <span className="text-[11px] font-bold px-[9px] py-[3px] rounded-pill"
                style={{ background: tierTone(row.tier).bg, border: `1px solid ${tierTone(row.tier).border}`, color: tierTone(row.tier).fg }}>
                {row.tier}
              </span>
            )}
            {row.kol_type && <span>{row.kol_type}</span>}
            {row.total_followers != null && <><span>·</span><span>{fmtFollow(row.total_followers)} followers</span></>}
            {row.status && <><span>·</span><span>{row.status}</span></>}
          </div>
          {(row.brand_fit?.length ?? 0) > 0 && (
            <div className="mt-[6px] flex gap-1 flex-wrap">
              {row.brand_fit!.map((b) => (
                <span key={b} className="text-[10.5px] font-bold px-[8px] py-[2px] rounded-pill bg-ivory border border-line3 text-muted">{b}</span>
              ))}
            </div>
          )}
        </div>
        {row.never_used && (
          <span className="text-[11px] font-bold px-[10px] py-[4px] rounded-pill" style={{ background: TONE.warn.bg, border: `1px solid ${TONE.warn.border}`, color: TONE.warn.fg }}>
            ยังไม่เคยใช้
          </span>
        )}
      </div>

      {/* Channels — the follower number itself opens the real profile */}
      {channels.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {channels.map((c) => {
            const ic = platformIcon(c.platform!);
            const body = (
              <>
                <span className="w-5 h-5 rounded-[6px] flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ background: ic.bg, color: ic.fg }}>{ic.icon}</span>
                <span className="text-[12px] font-bold text-ink">{c.followers != null ? fmtFollow(c.followers) : "—"}</span>
                <span className="text-[11px] text-faint">{c.platform}</span>
                {c.url && <ExternalLink size={11} className="text-faint" />}
              </>
            );
            return c.url
              ? <a key={c.platform} href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-[6px] rounded-pill border border-line2 bg-surface px-3 py-[6px] hover:border-line">{body}</a>
              : <span key={c.platform} className="inline-flex items-center gap-[6px] rounded-pill border border-line3 bg-ivory px-3 py-[6px]">{body}</span>;
          })}
        </div>
      )}

      {/* The buying-decision numbers */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <Stat label="ใช้ไปแล้ว" value={`${row.times_used} ครั้ง`} hint={row.last_used_at ? `ล่าสุด ${row.last_used_at}` : undefined} />
        <Stat label="Rate card" value={rate} />
        <Stat label="Reach รวม" value={row.total_reach != null ? fmtFollow(row.total_reach) : "—"} hint={row.total_cost != null ? `จ่ายไป ${baht(row.total_cost, { compact: true })}` : undefined} />
        <Stat label="Cost / reach" value={row.cost_per_reach != null ? `฿${Number(row.cost_per_reach).toFixed(3)}` : "—"} hint={tierBench != null ? `เทียร์ ${row.tier}: ฿${Number(tierBench).toFixed(3)}` : undefined} />
        <Stat label="Reach / follower" value={row.reach_per_follower != null ? `${Number(row.reach_per_follower).toFixed(2)}x` : "—"} hint="เกิน 1 = ไปไกลกว่าฐานผู้ติดตาม" />
        <Stat label="Engagement rate" value={row.engagement_rate != null ? `${Number(row.engagement_rate).toFixed(2)}%` : "—"} />
      </div>

      {verdict && (
        <div className="rounded-card px-4 py-[10px] text-[12px] font-semibold"
          style={{ background: TONE[verdict.tone].bg, border: `1px solid ${TONE[verdict.tone].border}`, color: TONE[verdict.tone].fg }}>
          {verdict.label} · เทียบจากงานจริง {bench.find((b) => b.tier === row.tier)?.samples ?? 0} ครั้งของเทียร์ {row.tier}
        </div>
      )}

      {/* History */}
      <div>
        <div className="text-[13px] font-bold text-ink mb-2">
          ประวัติการใช้งาน {history.length > 0 && <span className="text-faint font-normal">({history.length} ครั้ง)</span>}
        </div>
        {history.length === 0 ? (
          <div className="rounded-card border border-dashed border-line2 bg-ivory px-4 py-6 text-center text-[12px] text-faint">
            ยังไม่เคยร่วมงานกับ KOL รายนี้ — ไม่มีข้อมูลผลงานให้ใช้ตัดสินใจ
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((h) => {
              // Brand-coloured left edge: a creator working across three brands
              // is the common case here, and the eye should catch that first.
              const bc = h.brand ? brandColor(h.brand) : "#D7D2C8";
              return (
              <div key={h.collab_id} className="rounded-card border border-line bg-surface px-4 py-3"
                style={{ borderLeft: `4px solid ${bc}` }}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[12.5px] font-bold text-ink">{h.campaign_name ?? "— ไม่ระบุแคมเปญ —"}</span>
                  {h.brand && (
                    <span className="text-[10.5px] font-bold px-[8px] py-[2px] rounded-pill"
                      style={{ background: `${bc}1A`, color: bc }}>{brandName(h.brand)}</span>
                  )}
                  {h.branch && <span className="text-[11px] text-faint">{h.branch}</span>}
                  {h.month_key && <span className="text-[11px] text-faint">· {h.month_key}</span>}
                  <span className="ml-auto text-[11px] font-semibold text-muted">{h.status ?? "—"}</span>
                </div>
                <div className="mt-[6px] flex gap-x-4 gap-y-1 flex-wrap text-[11.5px] text-muted">
                  <span>Reach <b className="text-ink">{h.actual_reach != null ? fmtFollow(h.actual_reach) : "—"}</b></span>
                  <span>Engage <b className="text-ink">{h.actual_engagement != null ? fmtFollow(h.actual_engagement) : "—"}</b></span>
                  <span>ค่าใช้จ่าย <b className="text-ink">{h.total_cost != null ? baht(h.total_cost, { compact: true }) : "—"}</b></span>
                  {h.deal_type && <span>{h.deal_type}</span>}
                </div>
                {(h.posts?.length ?? 0) > 0 && (
                  <div className="mt-2 flex gap-[6px] flex-wrap">
                    {h.posts!.map((p) => {
                      const ic = platformIcon(p.platform ?? "");
                      const label = `${p.platform ?? "—"}${p.reach != null ? ` · ${fmtFollow(p.reach)}` : ""}`;
                      return p.post_url ? (
                        <a key={p.post_id} href={p.post_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-[5px] rounded-pill border border-line2 bg-ivory px-[9px] py-[3px] text-[11px] text-muted hover:border-line">
                          <span className="w-[14px] h-[14px] rounded-[4px] flex items-center justify-center text-[8px] font-bold" style={{ background: ic.bg, color: ic.fg }}>{ic.icon}</span>
                          {label}<ExternalLink size={10} />
                        </a>
                      ) : (
                        <span key={p.post_id} className="inline-flex items-center gap-[5px] rounded-pill border border-line3 bg-ivory px-[9px] py-[3px] text-[11px] text-faint">
                          <span className="w-[14px] h-[14px] rounded-[4px] flex items-center justify-center text-[8px] font-bold" style={{ background: ic.bg, color: ic.fg }}>{ic.icon}</span>
                          {label}
                        </span>
                      );
                    })}
                  </div>
                )}
                {!compact && h.why_chosen && (
                  <div className="mt-2 text-[11px] text-faint whitespace-pre-wrap border-t border-line4 pt-2">{h.why_chosen}</div>
                )}
                {(h.performance_tag || h.next_action) ? (
                  <div className="mt-2 flex gap-2 flex-wrap text-[11px]">
                    {h.performance_tag && <span className="font-bold px-[8px] py-[2px] rounded-pill bg-ivory border border-line3 text-muted">{h.performance_tag}</span>}
                    {h.next_action && <span className="px-[8px] py-[2px] rounded-pill bg-ivory border border-line3 text-muted">{h.next_action}</span>}
                  </div>
                ) : h.status === "Resulted" && (
                  <div className="mt-2 text-[11px] font-semibold" style={{ color: TONE.warn.fg }}>
                    ⚠ ยังไม่ได้สรุปผล — ขาด Performance tag และ Next action
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      <KolNotes kolId={kolId} />
    </div>
  );
}

/** Notes on the creator. Deliberately free text and append-only: this is where
 *  "ไม่รับบรีฟ", "ต่อราคาได้ถึง 8,000", "เจ้าของเพจย้ายไปอยู่ภูเก็ตแล้ว" live —
 *  the things that decide a booking but will never earn a column. */
function KolNotes({ kolId }: { kolId: string }) {
  const { member, user } = useAuth();
  const author = member?.name || user?.email?.split("@")[0] || "";
  const [notes, setNotes] = useState<KolNote[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchKolNotes(kolId).then(setNotes).catch(() => {}); }, [kolId]);

  const save = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      const created = await addKolNote({ kol_id: kolId, body: draft, author });
      if (created) { setNotes((n) => [created, ...n]); setDraft(""); }
    } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (await deleteKolNote(id)) setNotes((n) => n.filter((x) => x.note_id !== id));
  };

  return (
    <div>
      <div className="text-[13px] font-bold text-ink mb-2">
        Note {notes.length > 0 && <span className="text-faint font-normal">({notes.length})</span>}
      </div>
      <div className="flex gap-2 items-start">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(); }}
          placeholder="บันทึกสิ่งที่คุยไว้ เงื่อนไข ข้อควรระวัง… (⌘/Ctrl + Enter เพื่อบันทึก)"
          className="flex-1 text-[12.5px] px-[12px] py-[9px] rounded-[10px] border border-line2 bg-ivory outline-none" />
        <button onClick={save} disabled={!draft.trim() || busy}
          className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[9px] disabled:opacity-40">
          {busy ? "…" : "บันทึก"}
        </button>
      </div>
      {notes.length > 0 && (
        <div className="mt-2 flex flex-col gap-[6px]">
          {notes.map((n) => (
            <div key={n.note_id} className="group rounded-card border border-line4 bg-ivory px-3 py-2">
              <div className="text-[12px] text-ink whitespace-pre-wrap">{n.body}</div>
              <div className="mt-1 flex items-center gap-2 text-[10.5px] text-faint">
                <span>{n.author || "—"}</span>
                <span>· {n.created_at.slice(0, 16).replace("T", " ")}</span>
                <button onClick={() => remove(n.note_id)}
                  className="ml-auto opacity-0 group-hover:opacity-100 hover:text-ink">ลบ</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
