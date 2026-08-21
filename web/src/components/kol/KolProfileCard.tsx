"use client";

// The KOL 360 card — everything we know about one creator in one place:
// who they are, what they cost, every time we booked them, and what came back.
// Rendered full-page at /kol/[id] (shareable, opens in its own tab) and reused
// inside the Library drawer for a quick look without leaving the table.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/toast";
import { baht } from "@/lib/format";
import { VAT_RATE, WHT_PRESETS, grossUpFromNet, rateLabel } from "@/lib/data/expenseTax";
import { brandName, brandColor } from "@/lib/brands";
import { platformIcon, KOL_CHANNEL_PLATFORMS } from "@/lib/platforms";
import { initials, fmtFollow } from "@/lib/data/kol";
import { tierTone, categoryTone, categoryOptions, PARTNER_TONE, KOL_TIERS } from "@/lib/kolTier";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { DuplicateLinkWarning, useDuplicateLink } from "@/components/kol/DuplicateLinkWarning";
import { useAuth } from "@/lib/auth";
import {
  fetchKolScorecard, fetchKolEngagements, fetchKolTierBenchmarks,
  fetchKolNotes, addKolNote, deleteKolNote, setKolPartner, confirmChannelFollowers,
  setAgreedPostDate, attributeDelay, createKolExpenseRequest, updateKolCosts, costTotal,
  updateKolProfile, saveKolChannel,
  followerFreshness, daysLate,
  FOLLOWER_STALE_DAYS, DELAY_REASONS,
  KolScorecardRow, KolEngagementRow, KolTierBenchmark, KolNote, KolChannel, DelayReason,
  KolCostBreakdown,
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

interface Tone { bg: string; border: string; fg: string }

const TONE_OK: Tone = { bg: "#EEF4EE", border: "#CFE4C2", fg: "#3F6A34" };
const TONE = {
  good: TONE_OK,
  ok:   { bg: "#F4F6FA", border: "#D5DEEF", fg: "#3E5C9A" },
  warn: { bg: "#FBF6EC", border: "#EADBC1", fg: "#8A6D1E" },
  bad:  { bg: "#FFF5F4", border: "#F5C8C4", fg: "#B33A2E" },
};

/** How far the final bill may drift past the approved figure before it is
 *  worth interrupting anyone. Food support is estimated at proposal time, so a
 *  small overshoot is normal and a zero-tolerance flag would be noise. */
const OVERSPEND_TOLERANCE = 0.1;

const FRESH_TONE: Record<string, Tone & { label: string }> = {
  fresh:      { ...TONE_OK, label: "ยืนยันแล้ว" },
  stale:      { bg: "#FBF6EC", border: "#EADBC1", fg: "#8A6D1E", label: `เกิน ${FOLLOWER_STALE_DAYS} วัน` },
  unverified: { bg: "#F5F3EF", border: "#E3DED4", fg: "#8b8378", label: "ยังไม่เคยยืนยัน" },
};

/** One platform: open the profile, type what you see, save. The save stamps the
 *  date, which is the only thing that makes the number trustworthy later. */
function ChannelChip({ channel, author }: { channel: KolChannel; author: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(channel.followers != null ? String(channel.followers) : "");
  const [followers, setFollowers] = useState(channel.followers);
  const [checkedAt, setCheckedAt] = useState(channel.checked_at);
  const [busy, setBusy] = useState(false);
  const ic = platformIcon(channel.platform ?? "");
  const fresh = followerFreshness(checkedAt);
  const tone = FRESH_TONE[fresh];

  const save = async () => {
    const n = Number(value.replace(/[^0-9]/g, ""));
    if (!Number.isFinite(n) || busy || !channel.channel_id) return;
    setBusy(true);
    const stamp = await confirmChannelFollowers(channel.channel_id, n, author);
    if (stamp) { setFollowers(n); setCheckedAt(stamp); setEditing(false); }
    setBusy(false);
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-[6px] rounded-pill border px-3 py-[5px]" style={{ borderColor: ic.bg, background: "#fff" }}>
        <span className="w-5 h-5 rounded-[6px] flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ background: ic.bg, color: ic.fg }}>{ic.icon}</span>
        <input autoFocus value={value} inputMode="numeric"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="w-[86px] text-[12px] font-bold text-ink bg-ivory rounded-[7px] px-2 py-[3px] outline-none" />
        <button onClick={save} disabled={busy} className="text-[11px] font-bold text-accent disabled:opacity-40">{busy ? "…" : "บันทึก"}</button>
        <button onClick={() => setEditing(false)} className="text-[11px] text-faint hover:text-ink">ยกเลิก</button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-[6px] rounded-pill border px-3 py-[6px]"
      style={{ background: tone.bg, borderColor: tone.border }}
      title={checkedAt ? `ยืนยันล่าสุด ${checkedAt.slice(0, 10)}` : "ยังไม่มีใครยืนยันตัวเลขนี้ — ไม่รู้ว่าเก่าแค่ไหน"}>
      <span className="w-5 h-5 rounded-[6px] flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ background: ic.bg, color: ic.fg }}>{ic.icon}</span>
      <span className="text-[12px] font-bold text-ink">{followers != null ? fmtFollow(followers) : "—"}</span>
      <span className="text-[10.5px]" style={{ color: tone.fg }}>{tone.label}</span>
      {channel.url && (
        <a href={channel.url} target="_blank" rel="noreferrer" title="เปิดโปรไฟล์จริง" className="text-faint hover:text-ink">
          <ExternalLink size={11} />
        </a>
      )}
      <button onClick={() => { setValue(followers != null ? String(followers) : ""); setEditing(true); }}
        className="text-[10.5px] font-bold text-accent hover:underline">อัปเดต</button>
    </span>
  );
}

/** One channel row of the edit form. Pasting a link that already belongs to a
 *  DIFFERENT profile is how two rows end up describing one creator, so the
 *  check runs here too — excluding this profile, which is not its own
 *  duplicate. */
function EditChannelRow({ channel, excludeKolId, onChange }: {
  channel: { platform: string; url: string };
  excludeKolId: string;
  onChange: (patch: Partial<{ platform: string; url: string }>) => void;
}) {
  const duplicates = useDuplicateLink(channel.url, excludeKolId);
  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        <select value={channel.platform} onChange={(e) => onChange({ platform: e.target.value })}
          className="text-[13px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-white outline-none w-[130px]">
          <option value="">— เลือก —</option>
          {KOL_CHANNEL_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input value={channel.url} onChange={(e) => onChange({ url: e.target.value })}
          placeholder="https://… ลิงก์โปรไฟล์"
          className="flex-1 min-w-[200px] text-[13px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-white outline-none" />
      </div>
      <DuplicateLinkWarning matches={duplicates} className="mt-[6px]" />
    </div>
  );
}

/** Correct anything the sheet import got wrong, or never had.
 *
 *  Before this, a saved profile was frozen except for its follower counts: a new
 *  phone number, a rate that went up, a channel the creator opened last month —
 *  none of it could be recorded, so it lived in someone's chat and the library
 *  slowly stopped describing reality.
 *
 *  Deliberately NOT editable here: display_name (it is how every campaign row
 *  and every sheet import matches this person — renaming from a side panel
 *  would orphan the history) and the follower numbers (those have their own
 *  confirm-and-stamp flow, which is what makes them datable). */
function KolEditForm({ row, author, onSaved, onCancel }: {
  row: KolScorecardRow; author: string; onSaved: () => void; onCancel: () => void;
}) {
  const field = "w-full text-[13px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-ivory outline-none";
  const label = "block text-[11px] font-bold text-faint mb-[5px]";
  const brandVisibility = useBrandVisibility();
  const [category, setCategory] = useState(row.kol_type ?? "");
  const [tier, setTier] = useState(row.tier ?? "");
  const [contact, setContact] = useState(row.contact_agency ?? "");
  const [rate, setRate] = useState(row.rate_min_thb != null ? String(row.rate_min_thb) : "");
  const [brandFit, setBrandFit] = useState<string[]>(row.brand_fit ?? []);
  const [busy, setBusy] = useState(false);
  // Existing channels plus one blank row, so "add the TikTok they just opened"
  // needs no extra click to discover.
  const [channels, setChannels] = useState(() => [
    ...(row.channels ?? []).filter((c) => c.platform).map((c) => ({
      channel_id: c.channel_id, platform: c.platform ?? "", url: c.url ?? "",
    })),
    { channel_id: undefined as string | undefined, platform: "", url: "" },
  ]);
  const setCh = (i: number, patch: Partial<{ platform: string; url: string }>) =>
    setChannels((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const rateNumber = rate.trim() ? Number(rate.replace(/[^0-9.]/g, "")) : null;
  const rateInvalid = rate.trim() !== "" && (rateNumber == null || !Number.isFinite(rateNumber));

  const save = async () => {
    if (busy || rateInvalid) return;
    setBusy(true);
    try {
      const ok = await updateKolProfile(row.kol_id, {
        kol_type: category.trim() || null,
        tier: tier || null,
        contact_agency: contact.trim() || null,
        brand_fit: brandFit,
        // Only touched when something was typed — clearing the box would
        // otherwise wipe a rate nobody meant to remove.
        ...(rate.trim() ? { rate_thb: rateNumber } : {}),
      });
      if (!ok) { toastError("บันทึกโปรไฟล์ไม่สำเร็จ — ลองใหม่อีกครั้ง"); return; }

      // Channels are saved one by one so a single bad row cannot lose the rest.
      const touched = channels.filter((c) => c.platform.trim() && (c.channel_id || c.url.trim()));
      const failed = (await Promise.all(touched.map((c) =>
        saveKolChannel(row.kol_id, { channel_id: c.channel_id, platform: c.platform, url: c.url }, author),
      ))).filter((v) => !v).length;
      if (failed) toastError(`บันทึกช่องทางไม่สำเร็จ ${failed} รายการ — ที่เหลือบันทึกแล้ว`);
      else toastSuccess("บันทึกโปรไฟล์แล้ว");
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[14px] border border-line2 bg-ivory p-4 flex flex-col gap-3">
      <div className="text-[12px] font-extrabold text-ink">✏️ แก้ไขโปรไฟล์</div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div>
          <label className={label}>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
            <option value="">— ยังไม่ระบุ —</option>
            {categoryOptions(row.kol_type).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Tier</label>
          <select value={tier} onChange={(e) => setTier(e.target.value)} className={field}>
            <option value="">— คิดจากยอด follower —</option>
            {KOL_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>ช่องทางติดต่อ · เอเจนซี่</label>
          <input value={contact} onChange={(e) => setContact(e.target.value)} className={field} placeholder="Line / เบอร์ / อีเมล / เอเจนซี่" />
        </div>
        <div>
          <label className={label}>Rate card (บาท)</label>
          <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="numeric" className={field}
            style={rateInvalid ? { borderColor: "#B33A2E", background: "#FFF7F6" } : undefined} placeholder="14,000" />
          <div className="text-[10.5px] text-faint mt-[4px]">
            {rateInvalid ? <span className="text-status-red font-bold">กรอกเป็นตัวเลข</span> : "เรตเดิมถูกเก็บเป็นประวัติ ไม่ได้ถูกทับ"}
          </div>
        </div>
      </div>

      <div>
        <label className={label}>เหมาะกับแบรนด์</label>
        <div className="flex gap-2 flex-wrap">
          {brandVisibility.visibleBrands.map((b) => {
            const on = brandFit.includes(brandName(b));
            return (
              <button key={b} type="button"
                onClick={() => setBrandFit((f) => (on ? f.filter((x) => x !== brandName(b)) : [...f, brandName(b)]))}
                className="text-[11.5px] font-bold px-[11px] py-[5px] rounded-pill border"
                style={on
                  ? { background: brandColor(b), borderColor: brandColor(b), color: "#fff" }
                  : { background: "#fff", borderColor: "#E5DECF", color: "#6b6258" }}>
                {brandName(b)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className={label}>ลิงก์ช่องทาง · เพิ่มช่องทางใหม่ได้ที่แถวว่าง</label>
        <div className="flex flex-col gap-2">
          {channels.map((c, i) => (
            <EditChannelRow
              key={c.channel_id ?? `new-${i}`} channel={c} excludeKolId={row.kol_id}
              onChange={(patch) => setCh(i, patch)}
            />
          ))}
          <button type="button" onClick={() => setChannels((cs) => [...cs, { channel_id: undefined, platform: "", url: "" }])}
            className="self-start text-[11.5px] font-bold text-accent">+ อีกช่องทาง</button>
        </div>
        <div className="text-[10.5px] text-faint mt-[5px]">
          ยอด follower แก้ที่ชิปด้านบน (กด &quot;อัปเดต&quot;) — ตรงนั้นจะประทับวันที่ยืนยันให้ด้วย
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={save} disabled={busy || rateInvalid}
          className="text-[12.5px] font-bold text-white bg-panel rounded-[10px] px-5 py-[9px] disabled:opacity-40">
          {busy ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        <button onClick={onCancel} className="text-[12.5px] font-semibold text-muted border border-line2 rounded-[10px] px-5 py-[9px] bg-white">ยกเลิก</button>
      </div>
    </div>
  );
}

/**
 * Delivery timing for one booking. Two jobs: capture the date agreed with the
 * creator (without it "late" is unmeasurable, and the sheet never had it), and
 * when a post misses that date, make someone say whose fault it was. Only a
 * delay attributed to the creator touches their reliability score — our own
 * approval bottleneck must not be filed under their name.
 */
function DeliveryRow({ engagement, author, kolId }: { engagement: KolEngagementRow; author: string; kolId: string }) {
  const [agreed, setAgreed] = useState(engagement.agreed_post_at);
  const [reason, setReason] = useState<DelayReason | null>(engagement.delay_reason);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(engagement.agreed_post_at ?? "");
  const [busy, setBusy] = useState(false);
  const late = daysLate(agreed, engagement.posted_at);

  const saveAgreed = async () => {
    setBusy(true);
    if (await setAgreedPostDate(engagement.collab_id, draft || null)) { setAgreed(draft || null); setEditing(false); }
    setBusy(false);
  };
  const saveReason = async (r: DelayReason) => {
    setBusy(true);
    if (await attributeDelay(engagement.collab_id, r, undefined, author, kolId)) setReason(r);
    setBusy(false);
  };

  return (
    <div className="mt-2 pt-2 border-t border-line4/60 text-[11px] flex items-center gap-2 flex-wrap">
      <span className="text-faint">นัดโพสต์</span>
      {editing ? (
        <>
          <input type="date" value={draft} onChange={(e) => setDraft(e.target.value)}
            className="text-[11px] bg-white border border-line2 rounded-[7px] px-2 py-[2px] outline-none" />
          <button onClick={saveAgreed} disabled={busy} className="font-bold text-accent disabled:opacity-40">บันทึก</button>
          <button onClick={() => setEditing(false)} className="text-faint hover:text-ink">ยกเลิก</button>
        </>
      ) : (
        <button onClick={() => { setDraft(agreed ?? ""); setEditing(true); }}
          className="font-semibold text-muted hover:underline">{agreed ?? "— ยังไม่ระบุ —"}</button>
      )}
      <span className="text-faint">· โพสต์จริง {engagement.posted_at ?? "—"}</span>

      {late != null && late > 0 && (
        <>
          <span className="font-bold" style={{ color: "#C0392B" }}>ช้า {late} วัน</span>
          {reason ? (
            <span className="px-[8px] py-[2px] rounded-pill font-semibold"
              style={{ background: "#F5F3EF", border: "1px solid #E3DED4", color: "#6b6258" }}>
              {DELAY_REASONS.find((d) => d.value === reason)?.label}
              {DELAY_REASONS.find((d) => d.value === reason)?.blamesKol === false && " · ไม่หักคะแนน KOL"}
            </span>
          ) : (
            <span className="flex items-center gap-1 flex-wrap">
              <span className="font-bold" style={{ color: "#C0392B" }}>← เพราะอะไร?</span>
              {DELAY_REASONS.map((d) => (
                <button key={d.value} onClick={() => saveReason(d.value)} disabled={busy}
                  className="px-[7px] py-[2px] rounded-pill border border-line2 bg-white hover:border-accent disabled:opacity-40">
                  {d.label}
                </button>
              ))}
            </span>
          )}
        </>
      )}
      {late === 0 && <span className="font-semibold" style={{ color: "#3F6A34" }}>ตรงเวลา</span>}
    </div>
  );
}

/**
 * Raise the reimbursement for this booking without re-keying it. The specialist
 * still owns the decision to file (per the team's own rule), but the campaign,
 * brand and amount travel with them, and the link back means Finance and KOL are
 * looking at one number instead of two that drift.
 */
const COST_FIELDS: { key: keyof KolCostBreakdown; label: string; hint?: string }[] = [
  { key: "paid_fee", label: "ค่าตัว" },
  { key: "food_cost", label: "ค่าอาหารจริง", hint: "ยอดตามบิลจริง ไม่ใช่ที่ประเมินไว้ตอนดีล" },
  { key: "boost_cost", label: "ค่า boost" },
  { key: "other_cost", label: "อื่นๆ" },
];

/**
 * Check the numbers before filing, and fix the food support while you are here.
 *
 * The button used to file straight from the stored total. Food support is booked
 * as an estimate and settles when the bill arrives — across the imported deals it
 * is 30% of what was actually paid — so the one figure most likely to be wrong at
 * this moment was the one nobody was being shown.
 *
 * Corrections write back to the deal as well as the request. A number fixed only
 * on the Finance side would leave cost-per-reach and the tier benchmarks running
 * on the estimate, which is the drift the expense link exists to stop.
 */
function ExpenseReviewSheet({ engagement, kolName, requester, onClose, onFiled }: {
  engagement: KolEngagementRow; kolName: string; requester: string;
  onClose: () => void; onFiled: (id: string, costs: KolCostBreakdown) => void;
}) {
  const [costs, setCosts] = useState<KolCostBreakdown>({
    paid_fee: engagement.paid_fee ?? 0,
    food_cost: engagement.food_cost ?? 0,
    boost_cost: engagement.boost_cost ?? 0,
    other_cost: engagement.other_cost ?? 0,
  });
  const [busy, setBusy] = useState(false);
  // No default rate: it is 2% or 3% depending on how the deal was contracted,
  // and a pre-filled guess is the kind of thing nobody re-reads. "ไม่หัก" has to
  // be chosen too, so a request that withholds nothing did so on purpose.
  const [whtRate, setWhtRate] = useState<number | null>(null);
  const [applyVat, setApplyVat] = useState(false);

  const total = costTotal(costs);
  const wasTotal = engagement.total_cost ?? 0;
  const changed = total !== wasTotal;

  // Withholding applies to what the creator is paid — the fee, and a boost we
  // hand them to run. Food support is the restaurant's bill, not their income.
  const payableToKol = (costs.paid_fee || 0) + (costs.boost_cost || 0);
  const passThrough = (costs.food_cost || 0) + (costs.other_cost || 0);
  // The stored fee is what was transferred, so it is already net of tax; the
  // invoice value has to be recovered before anything is withheld from it.
  const { gross, wht } = grossUpFromNet(payableToKol, whtRate ?? 0);
  const requested = gross + passThrough;
  const vat = applyVat ? Math.round((requested * VAT_RATE) / 100) : 0;
  const payout = requested - wht + vat;

  const approved = engagement.approved_amount;
  const over = approved != null && approved > 0 && requested > approved * (1 + OVERSPEND_TOLERANCE);

  const submit = async () => {
    setBusy(true);
    try {
      // Correct the deal first. If filing then fails the numbers are still right;
      // the other order would leave Finance holding a figure the deal denies.
      if (changed && !(await updateKolCosts(engagement.collab_id, costs))) {
        toastError("แก้ตัวเลขในดีลไม่สำเร็จ — ยังไม่ได้ส่งใบเบิก");
        return;
      }
      const res = await createKolExpenseRequest({
        collabId: engagement.collab_id,
        brand: engagement.brand,
        campaign: engagement.campaign_name,
        campaignId: engagement.campaign_id,
        amount: requested,
        kolName,
        requester,
        vat,
        wht,
        whtRate: whtRate ?? 0,
      });
      if ("id" in res) { onFiled(res.id, costs); onClose(); }
      else toastError(res.error);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,18,16,0.45)" }}
      onClick={onClose}>
      <div className="bg-surface rounded-cardLg border border-line w-full max-w-[430px] max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-line4">
          <div className="text-[14px] font-extrabold text-ink">ตรวจก่อนส่งใบเบิก</div>
          <div className="text-[11.5px] text-faint mt-[2px]">
            {[kolName, engagement.campaign_name, engagement.brand ? brandName(engagement.brand) : null, engagement.month_key]
              .filter(Boolean).join(" · ")}
          </div>
        </div>

        <div className="px-5 py-4 flex flex-col gap-[10px]">
          {COST_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-3">
              <span className="text-[12px] font-semibold text-muted w-[104px] flex-shrink-0">
                {f.label}
                {f.hint && <span className="block text-[10px] font-normal text-faint leading-tight mt-[1px]">{f.hint}</span>}
              </span>
              <input
                type="number" min={0} inputMode="numeric"
                value={costs[f.key]}
                onChange={(e) => setCosts({ ...costs, [f.key]: Math.max(0, Number(e.target.value) || 0) })}
                className="flex-1 text-[13px] font-semibold text-ink text-right bg-white border border-line2 rounded-[9px] px-3 py-[7px] outline-none focus:border-accent"
              />
            </label>
          ))}

          {/* Tax. Deliberately after the amounts and before the total: it changes
              the total, so burying it under the figure it moves would be a lie
              about what is being filed. */}
          <div className="border-t border-line4 pt-[10px] mt-[2px] flex flex-col gap-[8px]">
            <div className="flex items-start gap-3">
              <span className="text-[12px] font-semibold text-muted w-[104px] flex-shrink-0 pt-[6px]">
                หัก ณ ที่จ่าย
                <span className="block text-[10px] font-normal text-faint leading-tight mt-[1px]">
                  คิดจากค่าตัว + boost เท่านั้น
                </span>
              </span>
              <div className="flex-1 flex flex-wrap gap-1">
                {[...WHT_PRESETS, { rate: 0, label: "ไม่หัก" }].map((p) => (
                  <button key={p.rate} type="button" onClick={() => setWhtRate(p.rate)}
                    className="text-[11px] font-bold rounded-[8px] px-2.5 py-[5px] border transition"
                    style={whtRate === p.rate
                      ? { background: "#211F1C", color: "#fff", borderColor: "#211F1C" }
                      : { background: "#fff", color: "#6B6577", borderColor: "#ECEAF2" }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-[11.5px] text-muted">
              <input type="checkbox" checked={applyVat} onChange={(e) => setApplyVat(e.target.checked)} />
              KOL / เอเจนซี่รายนี้จด VAT — บวก VAT {VAT_RATE}%
            </label>
          </div>

          {whtRate == null ? (
            <div className="text-[11px] rounded-[8px] px-[10px] py-[7px] font-semibold"
              style={{ background: TONE.warn.bg, border: `1px solid ${TONE.warn.border}`, color: TONE.warn.fg }}>
              เลือกอัตราหัก ณ ที่จ่ายก่อน — 2% ค่าโฆษณา หรือ 3% ค่าบริการ แล้วแต่สัญญาของดีลนี้
            </div>
          ) : (
            <div className="text-[11px] flex flex-col gap-[3px] rounded-[8px] px-[10px] py-[8px]"
              style={{ background: "#F7F6F2", border: "1px solid #E9E5DC" }}>
              {wht > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted">ค่าตัว+boost ก่อนหัก (ตั้งเบิก)</span>
                    <span className="font-semibold text-ink">{baht(gross)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">หัก ณ ที่จ่าย {rateLabel(whtRate)}</span>
                    <span className="font-semibold text-ink">− {baht(wht)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">KOL ได้รับจริง</span>
                    <span className="font-semibold text-ink">{baht(payableToKol)}</span>
                  </div>
                </>
              )}
              {passThrough > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted">ค่าอาหาร + อื่นๆ (ไม่หัก)</span>
                  <span className="font-semibold text-ink">{baht(passThrough)}</span>
                </div>
              )}
              {vat > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted">VAT {VAT_RATE}%</span>
                  <span className="font-semibold text-ink">+ {baht(vat)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-line4 pt-[3px] mt-[2px]">
                <span className="text-muted">ยอดจ่ายออกจริง</span>
                <span className="font-semibold text-ink">{baht(payout)}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-line4 pt-[10px] mt-[2px]">
            <span className="text-[12.5px] font-bold text-ink">รวมที่จะเบิก</span>
            <span className="text-[17px] font-extrabold text-ink">{baht(requested)}</span>
          </div>

          {changed && (
            <div className="text-[11px] rounded-[8px] px-[10px] py-[7px]"
              style={{ background: "#EEF1F8", border: "1px solid #CBD6EA", color: "#3E5C9A" }}>
              เดิมบันทึกไว้ {baht(wasTotal)} — ตัวเลขใหม่จะอัปเดตต้นทุนของดีลนี้ด้วย
              จึงมีผลกับ Cost/reach และค่าเฉลี่ยของเทียร์
            </div>
          )}

          {approved != null && approved > 0 && (
            <div className="text-[11px] text-faint">อนุมัติไว้ {baht(approved)}</div>
          )}
          {over && (
            // A warning, not a block: going over can be the right call. What must
            // not happen is going over without anyone noticing.
            <div className="text-[11px] rounded-[8px] px-[10px] py-[7px] font-semibold"
              style={{ background: TONE.warn.bg, border: `1px solid ${TONE.warn.border}`, color: TONE.warn.fg }}>
              ⚠ เกินยอดที่อนุมัติ {baht(requested - approved!)} (+{Math.round(((requested / approved!) - 1) * 100)}%) —
              เบิกได้ แต่ควรแจ้งผู้อนุมัติก่อน
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-line4 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={busy}
            className="text-[12.5px] font-bold text-muted border border-line2 rounded-[10px] px-4 py-[8px] bg-white disabled:opacity-40">
            ยกเลิก
          </button>
          <button onClick={submit} disabled={busy || requested <= 0 || whtRate == null}
            className="text-[12.5px] font-bold text-white rounded-[10px] px-4 py-[8px] bg-panel disabled:opacity-40">
            {busy ? "กำลังส่ง…" : `ส่งใบเบิก ${baht(requested)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExpenseRow({ engagement, kolName, requester }: {
  engagement: KolEngagementRow; kolName: string; requester: string;
}) {
  const [linked, setLinked] = useState(engagement.expense_request_id);
  const [open, setOpen] = useState(false);
  // Held locally so the row reflects a correction made in the sheet without
  // re-fetching the whole profile.
  const [row, setRow] = useState(engagement);
  const amount = row.total_cost ?? 0;
  // Only a real approved figure can be exceeded. Everything imported from the
  // sheet has none, so those stay silent rather than warning on a guess.
  const approved = row.approved_amount;
  const over = approved != null && approved > 0 && amount > approved * (1 + OVERSPEND_TOLERANCE);
  if (amount <= 0) return null;

  return (
    <div className="mt-1 text-[11px] flex flex-col gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-faint">ใบเบิก</span>
        {linked ? (
          <Link href="/expenses" className="font-bold text-accent hover:underline">
            สร้างแล้ว · #{linked} ↗
          </Link>
        ) : (
          <button onClick={() => setOpen(true)}
            className="font-bold text-accent border border-line2 rounded-[7px] px-[9px] py-[2px] bg-white hover:border-accent">
            ตรวจ &amp; เบิก {baht(amount, { compact: true })}
          </button>
        )}
        {approved != null && (
          <span className="text-faint">· อนุมัติไว้ {baht(approved, { compact: true })}</span>
        )}
        {row.paid_status && <span className="text-faint">· สถานะจ่าย {row.paid_status}</span>}
      </div>
      {over && (
        <div className="rounded-[8px] px-[10px] py-[6px] font-semibold"
          style={{ background: TONE.warn.bg, border: `1px solid ${TONE.warn.border}`, color: TONE.warn.fg }}>
          ⚠ เกินยอดที่อนุมัติ {baht(amount - approved!, { compact: true })}
          {` (+${Math.round(((amount / approved!) - 1) * 100)}%)`} — เบิกได้ แต่ควรแจ้งผู้อนุมัติก่อน
        </div>
      )}
      {open && (
        <ExpenseReviewSheet
          engagement={row} kolName={kolName} requester={requester}
          onClose={() => setOpen(false)}
          onFiled={(id, costs) => {
            setLinked(id);
            setRow({ ...row, ...costs, total_cost: costTotal(costs) });
            toastSuccess(`ส่งใบเบิก #${id} แล้ว`);
          }}
        />
      )}
    </div>
  );
}

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
  const { member, user } = useAuth();
  const author = member?.name || user?.email?.split("@")[0] || "";
  const [row, setRow] = useState<KolScorecardRow | null>(null);
  const [history, setHistory] = useState<KolEngagementRow[]>([]);
  const [bench, setBench] = useState<KolTierBenchmark[]>([]);
  const [partner, setPartner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  // Bumped after a save so the card re-reads what was just written rather than
  // patching its own copy — the rank and the tier are recomputed server-side.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([fetchKolScorecard(kolId), fetchKolEngagements(kolId), fetchKolTierBenchmarks()])
      .then(([r, h, b]) => {
        if (!alive) return;
        setRow(r); setHistory(h); setBench(b); setPartner(Boolean(r?.is_partner)); setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [kolId, reloadKey]);

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
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-[18px] font-extrabold text-ink truncate">{row.display_name}</span>
            {row.kol_code && <span className="text-[11.5px] font-bold text-faint whitespace-nowrap">{row.kol_code}</span>}
          </div>
          <div className="text-[12px] text-faint mt-[4px] flex items-center gap-2 flex-wrap">
            {row.tier && (
              <span className="text-[11px] font-bold px-[9px] py-[3px] rounded-pill"
                style={{ background: tierTone(row.tier).bg, border: `1px solid ${tierTone(row.tier).border}`, color: tierTone(row.tier).fg }}>
                {row.tier}
              </span>
            )}
            {row.kol_type && (
              <span className="text-[11px] font-semibold px-[9px] py-[3px] rounded-pill"
                style={{ background: categoryTone(row.kol_type).bg, border: `1px solid ${categoryTone(row.kol_type).border}`, color: categoryTone(row.kol_type).fg }}>
                {row.kol_type}
              </span>
            )}
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
        <div className="flex items-center gap-2">
          {row.never_used && (
            <span className="text-[11px] font-bold px-[10px] py-[4px] rounded-pill" style={{ background: TONE.warn.bg, border: `1px solid ${TONE.warn.border}`, color: TONE.warn.fg }}>
              ยังไม่เคยใช้
            </span>
          )}
          <button
            onClick={() => setEditing((v) => !v)}
            title="แก้ไข category / tier / ช่องทางติดต่อ / rate card / ลิงก์ช่องทาง"
            className="text-[11px] font-bold px-[10px] py-[4px] rounded-pill"
            style={editing
              ? { background: "#211F1C", border: "1px solid #211F1C", color: "#fff" }
              : { background: "#fff", border: "1px solid #E5DECF", color: "#6b6258" }}>
            ✏️ แก้ไข
          </button>
          <button
            onClick={async () => {
              const next = !partner;
              setPartner(next);
              if (!(await setKolPartner(kolId, next))) setPartner(!next);
            }}
            title={partner ? "ยกเลิกสถานะ Partner" : "ตั้งเป็น KOL Partner"}
            className="text-[11px] font-bold px-[10px] py-[4px] rounded-pill"
            style={partner
              ? { background: PARTNER_TONE.bg, border: `1px solid ${PARTNER_TONE.border}`, color: PARTNER_TONE.fg }
              : { background: "#fff", border: "1px dashed #D7D2C8", color: "#9A9387" }}>
            {partner ? "✓ KOL Partner" : "+ ตั้งเป็น Partner"}
          </button>
        </div>
      </div>

      {editing && (
        <KolEditForm
          row={row}
          author={author}
          onSaved={() => { setEditing(false); setReloadKey((k) => k + 1); }}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* Channels — open the real profile, and confirm the number while you are
          looking at it. Ten seconds each, and the count stops being undateable. */}
      {channels.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {channels.map((c) => (
            <ChannelChip key={c.channel_id ?? c.platform} channel={c} author={author} />
          ))}
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
        <Stat
          label="ส่งงานตรงเวลา"
          value={row.on_time_rate != null ? `${Math.round(Number(row.on_time_rate) * 100)}%` : "—"}
          hint={row.late_unattributed ? `${row.late_unattributed} ครั้งยังไม่ระบุสาเหตุ` : (row.on_time_rate == null ? "ยังไม่มีงานที่ตัดสินได้" : undefined)}
        />
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
              const bc = h.brand ? brandColor(h.brand) : "#9A9387";
              return (
              <div key={h.collab_id} className="rounded-card px-4 py-3"
                style={{ background: `${bc}12`, border: `1px solid ${bc}38` }}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[12.5px] font-bold text-ink">{h.campaign_name ?? "— ไม่ระบุแคมเปญ —"}</span>
                  {h.brand && (
                    <span className="text-[10.5px] font-bold px-[8px] py-[2px] rounded-pill text-white"
                      style={{ background: bc }}>{brandName(h.brand)}</span>
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
                <DeliveryRow engagement={h} author={author} kolId={kolId} />
                <ExpenseRow engagement={h} kolName={row.display_name} requester={author} />
                {(h.performance_tag || h.next_action) ? (
                  <div className="mt-2 flex gap-2 flex-wrap text-[11px]">
                    {h.performance_tag && <span className="font-bold px-[8px] py-[2px] rounded-pill bg-ivory border border-line3 text-muted">{h.performance_tag}</span>}
                    {h.next_action && <span className="px-[8px] py-[2px] rounded-pill bg-ivory border border-line3 text-muted">{h.next_action}</span>}
                  </div>
                ) : h.status === "Resulted" && (
                  // Red on purpose: an unclosed booking is the one thing that
                  // stops this history from teaching us anything next time.
                  <div className="mt-2 text-[11px] font-bold" style={{ color: "#C0392B" }}>
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
