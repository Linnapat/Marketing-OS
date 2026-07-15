"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PerformanceTabs } from "@/components/performance/PerformanceTabs";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { BrandDot } from "@/components/ui/BrandDot";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { BrandFilterValue, BrandId, brandName } from "@/lib/brands";
import { num } from "@/lib/format";
import {
  fetchPerformanceSheet,
  PerformanceMonthlyRow,
  PerformancePostRow,
  PerformanceSheetPayload,
  PerformanceSummaryRow,
} from "@/lib/db/performanceSheet";

const ACCENT = "#0EA5A0";
const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun",
  "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
};

const fmtPct = (value: number, digits = 1) => `${value.toFixed(digits)}%`;
const sourceColor = (source: string) => source === "TikTok" ? "#111827" : "#3E5C9A";
const statusTone = (status: string) => /critical|🚨|not/i.test(status) ? "red" : /good|pass|✅/i.test(status) ? "green" : "gold";
const brief = (text: string) => text.length > 95 ? `${text.slice(0, 95)}…` : text || "—";

function blankPayload(): PerformanceSheetPayload {
  return { sourceUrl: "", generatedAt: "", summaryRows: [], monthlyRows: [], posts: [] };
}

function monthFromPost(post: PerformancePostRow): string {
  const raw = post.publishTime || post.reportDate;
  const iso = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return iso[2].padStart(2, "0");
  const slash = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) return slash[2].padStart(2, "0");
  return "";
}

function aggregatePosts(posts: PerformancePostRow[]) {
  const reach = posts.reduce((s, p) => s + (p.reach || 0), 0);
  const views = posts.reduce((s, p) => s + (p.views || 0), 0);
  const engagement = posts.reduce((s, p) => s + (p.engagement || 0), 0);
  const shares = posts.reduce((s, p) => s + (p.shares || 0), 0);
  const skipSource = posts.filter((p) => p.skipRate > 0);
  const fullSource = posts.filter((p) => p.fullRate > 0);
  return {
    posts: posts.length,
    reach,
    views,
    engagement,
    shares,
    shareRate: reach > 0 ? (shares / reach) * 100 : views > 0 ? (shares / views) * 100 : 0,
    skipRate: skipSource.length ? skipSource.reduce((s, p) => s + p.skipRate, 0) / skipSource.length : 0,
    fullRate: fullSource.length ? fullSource.reduce((s, p) => s + p.fullRate, 0) / fullSource.length : 0,
  };
}

export default function PlatformsPage() {
  const { visibleBrands } = useBrandVisibility();
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [month, setMonth] = useState("07");
  const [source, setSource] = useState<"all" | "Meta" | "TikTok">("all");
  const [sort, setSort] = useState<"reach" | "engagement" | "shares" | "skip">("reach");
  const [payload, setPayload] = useState<PerformanceSheetPayload>(() => blankPayload());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setPayload(await fetchPerformanceSheet());
    } catch (err) {
      setError(err instanceof Error ? err.message : "อ่าน Performance sheet ไม่ได้");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const months = useMemo(() => {
    const fromSummary = payload.monthlyRows.map((r) => r.month);
    const fromPosts = payload.posts.map(monthFromPost).filter(Boolean);
    return Array.from(new Set([...fromSummary, ...fromPosts])).sort((a, b) => Number(a) - Number(b));
  }, [payload.monthlyRows, payload.posts]);

  useEffect(() => {
    if (months.length && !months.includes(month)) setMonth(months[months.length - 1]);
  }, [month, months]);

  const summaryRows = useMemo(() => payload.summaryRows.filter((r) =>
    (!r.brandId || visibleBrands.includes(r.brandId as BrandId)) &&
    (brand === "all" || r.brandId === brand),
  ), [payload.summaryRows, visibleBrands, brand]);

  const monthlyRows = useMemo(() => payload.monthlyRows.filter((r) =>
    (!r.brandId || visibleBrands.includes(r.brandId as BrandId)) &&
    (brand === "all" || r.brandId === brand),
  ), [payload.monthlyRows, visibleBrands, brand]);

  const posts = useMemo(() => payload.posts.filter((p) =>
    (!p.brandId || visibleBrands.includes(p.brandId as BrandId)) &&
    (brand === "all" || p.brandId === brand) &&
    (source === "all" || p.source === source) &&
    (!month || monthFromPost(p) === month || p.reportDate.includes(`/${Number(month)}/`) || p.reportDate.includes(`-${month}-`)),
  ), [payload.posts, visibleBrands, brand, source, month]);

  const topPosts = useMemo(() => [...posts].sort((a, b) => {
    if (sort === "engagement") return b.engagement - a.engagement;
    if (sort === "shares") return b.shares - a.shares;
    if (sort === "skip") return a.skipRate - b.skipRate;
    return b.reach - a.reach;
  }).slice(0, 12), [posts, sort]);

  const currentSummary = useMemo(() => {
    const monthRows = monthlyRows.filter((r) => r.month === month);
    const fallback = summaryRows;
    const actualReach = monthRows.length ? monthRows.reduce((s, r) => s + r.actualReach, 0) : fallback.reduce((s, r) => s + r.actualReach, 0);
    const goalReach = monthRows.reduce((s, r) => s + r.kpiReach, 0);
    const postAgg = aggregatePosts(posts);
    return {
      actualReach,
      goalReach,
      goalPct: goalReach > 0 ? (actualReach / goalReach) * 100 : fallback.length ? fallback.reduce((s, r) => s + r.goalPct, 0) / fallback.length : 0,
      shareRate: postAgg.shareRate || (fallback.length ? fallback.reduce((s, r) => s + r.shareRate, 0) / fallback.length : 0),
      skipRate: postAgg.skipRate || (fallback.length ? fallback.reduce((s, r) => s + r.skipRate, 0) / fallback.length : 0),
      posts: postAgg.posts,
      engagement: postAgg.engagement,
    };
  }, [monthlyRows, month, summaryRows, posts]);

  const bySource = useMemo(() => {
    const meta = aggregatePosts(posts.filter((p) => p.source === "Meta"));
    const tiktok = aggregatePosts(posts.filter((p) => p.source === "TikTok"));
    return [
      { name: "Meta", label: "Instagram / Facebook", ...meta },
      { name: "TikTok", label: "TikTok organic", ...tiktok },
    ];
  }, [posts]);

  const brandCards = useMemo(() => {
    const ids = Array.from(new Set([
      ...summaryRows.map((r) => r.brandId).filter(Boolean),
      ...monthlyRows.map((r) => r.brandId).filter(Boolean),
    ])) as BrandId[];
    return ids.map((id) => {
      const s = summaryRows.find((r) => r.brandId === id);
      const m = monthlyRows.find((r) => r.brandId === id && r.month === month);
      const brandPosts = posts.filter((p) => p.brandId === id);
      const agg = aggregatePosts(brandPosts);
      return {
        id,
        name: brandName(id),
        actualReach: m?.actualReach ?? s?.actualReach ?? agg.reach,
        goalReach: m?.kpiReach ?? 0,
        goalPct: m?.kpiReach ? ((m.actualReach / m.kpiReach) * 100) : (s?.goalPct ?? 0),
        shareRate: agg.shareRate || m?.actualShareRate || s?.shareRate || 0,
        skipRate: agg.skipRate || m?.actualSkipRate || s?.skipRate || 0,
        status: s?.status || "—",
        posts: brandPosts.length,
      };
    }).sort((a, b) => b.actualReach - a.actualReach);
  }, [summaryRows, monthlyRows, posts, month]);

  const topReach = posts.reduce((best, p) => p.reach > (best?.reach ?? 0) ? p : best, null as PerformancePostRow | null);
  const topShare = posts.reduce((best, p) => p.shares > (best?.shares ?? 0) ? p : best, null as PerformancePostRow | null);

  return (
    <>
      <PageHeader
        eyebrow="Performance"
        title="Creative KPI Performance"
        subtitle="อ่านข้อมูลจาก Content_2026 Google Sheet เพื่อดู KPI งาน Creative, Meta, TikTok, top content และ brand health"
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="rounded-pill bg-[#E3F7F5] px-3 py-2 text-[11.5px] font-extrabold text-[#0B7F7A]">
              Sheet sync {error ? "needs setup" : "ready"}
            </span>
            <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-[12px] border border-[#BCEBE6] bg-[#E3F7F5] px-4 py-2 text-[12.5px] font-bold text-[#0B7F7A] disabled:opacity-50">
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        }
      />

      <PerformanceTabs />

      <section className="mt-4 rounded-[26px] border border-[#BCEBE6] bg-[#E3F7F5] p-5 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[12px] font-extrabold uppercase tracking-[0.13em] text-[#0B7F7A]">Creative KPI command</div>
            <div className="mt-1 text-[20px] font-extrabold text-ink">How is creative performing this month?</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BrandFilter value={brand} onChange={setBrand} label="" />
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-[14px] border border-[#BCEBE6] bg-white px-4 py-3 text-[13px] font-bold text-ink outline-none">
              {months.map((m) => <option key={m} value={m}>{MONTH_LABELS[m] ?? m}</option>)}
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value as "all" | "Meta" | "TikTok")} className="rounded-[14px] border border-[#BCEBE6] bg-white px-4 py-3 text-[13px] font-bold text-ink outline-none">
              <option value="all">All platforms</option>
              <option value="Meta">Meta</option>
              <option value="TikTok">TikTok</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-[16px] border border-status-red/30 bg-white px-4 py-3 text-[12.5px] font-semibold text-status-red">
            {error}
          </div>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <MetricCard label="Actual reach" value={num(currentSummary.actualReach)} hint={currentSummary.goalReach ? `${fmtPct(currentSummary.goalPct)} of goal ${num(currentSummary.goalReach)}` : "from raw performance"} />
          <MetricCard label="Share rate" value={fmtPct(currentSummary.shareRate, 2)} hint="shares ÷ reach/views" />
          <MetricCard label="Avg skip rate" value={fmtPct(currentSummary.skipRate, 0)} hint="lower is better" />
          <MetricCard label="Posts in view" value={num(currentSummary.posts)} hint={`${source === "all" ? "Meta + TikTok" : source} · ${MONTH_LABELS[month] ?? month}`} />
          <MetricCard label="Engagement" value={num(currentSummary.engagement)} hint="like + comment + share + save" />
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <HeroPost title="Top reach" post={topReach} metric={topReach ? num(topReach.reach || topReach.views) : "—"} />
          <HeroPost title="Top share" post={topShare} metric={topShare ? `${num(topShare.shares)} shares` : "—"} />
        </div>
      </section>

      <section className="mt-4 grid gap-3 lg:grid-cols-4">
        {brandCards.map((b) => (
          <div key={b.id} className="rounded-[22px] border border-line bg-surface p-4 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BrandDot brand={b.id} size={10} />
                <div className="font-extrabold text-ink">{b.name}</div>
              </div>
              <StatusBadge tone={statusTone(b.status)}>{b.status.replace("🚨 ", "")}</StatusBadge>
            </div>
            <div className="mt-4 text-[26px] font-extrabold text-ink">{num(b.actualReach)}</div>
            <div className="mt-1 text-[11.5px] font-semibold text-faint">{fmtPct(b.goalPct)} vs reach goal · {b.posts} posts</div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, b.goalPct))}%`, background: ACCENT }} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11.5px]">
              <div className="rounded-[12px] bg-[#F8F7F3] p-2">
                <div className="text-faint">Share rate</div>
                <div className="font-extrabold text-ink">{fmtPct(b.shareRate, 2)}</div>
              </div>
              <div className="rounded-[12px] bg-[#F8F7F3] p-2">
                <div className="text-faint">Skip rate</div>
                <div className="font-extrabold text-ink">{fmtPct(b.skipRate, 0)}</div>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-4 grid gap-3 lg:grid-cols-2">
        {bySource.map((s) => (
          <div key={s.name} className="rounded-[24px] border border-line bg-surface p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-faint">{s.label}</div>
                <div className="mt-1 text-[18px] font-extrabold text-ink">{s.name}</div>
              </div>
              <div className="rounded-[16px] px-4 py-2 text-[22px] font-extrabold text-white" style={{ background: sourceColor(s.name) }}>{num(s.posts)}</div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              <MiniMetric label="Reach/views" value={num(s.reach || s.views)} />
              <MiniMetric label="Engage" value={num(s.engagement)} />
              <MiniMetric label="Share rate" value={fmtPct(s.shareRate, 2)} />
              <MiniMetric label={s.name === "TikTok" ? "Full rate" : "Skip rate"} value={fmtPct(s.name === "TikTok" ? s.fullRate : s.skipRate, 0)} />
            </div>
          </div>
        ))}
      </section>

      <section className="mt-4 rounded-[24px] border border-line bg-surface shadow-soft overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <div className="text-[16px] font-extrabold text-ink">Creative top content board</div>
            <div className="text-[12px] text-faint">ดูโพสต์ที่ควรเรียนรู้/เอาไปต่อยอด — จาก Meta และ TikTok raw data</div>
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as "reach" | "engagement" | "shares" | "skip")} className="rounded-[12px] border border-line2 bg-white px-3 py-2 text-[12.5px] font-bold text-ink outline-none">
            <option value="reach">Sort by reach/views</option>
            <option value="engagement">Sort by engagement</option>
            <option value="shares">Sort by shares</option>
            <option value="skip">Sort by low skip</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-[12px]">
            <thead>
              <tr className="bg-ivory text-faint">
                {["Brand", "Source", "Publish", "Content", "Views", "Reach", "Engage", "Share", "Skip", ""].map((h, i) => (
                  <th key={h || i} className={`border-b border-line px-4 py-3 font-extrabold uppercase tracking-[0.08em] ${i < 4 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topPosts.map((p) => (
                <tr key={p.id} className="border-b border-line4 last:border-0 hover:bg-ivory/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-bold text-ink">
                      {p.brandId && <BrandDot brand={p.brandId} size={8} />}
                      {p.brandId ? brandName(p.brandId) : p.brand}
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className="rounded-pill px-2.5 py-1 text-[11px] font-extrabold text-white" style={{ background: sourceColor(p.source) }}>{p.source}</span></td>
                  <td className="px-4 py-3 text-muted">{p.publishTime || p.reportDate || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-ink">{brief(p.title)}</div>
                    <div className="text-[11px] text-faint">{p.type}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-ink">{num(p.views)}</td>
                  <td className="px-4 py-3 text-right font-bold text-ink">{num(p.reach)}</td>
                  <td className="px-4 py-3 text-right text-muted">{num(p.engagement)}</td>
                  <td className="px-4 py-3 text-right text-muted">{fmtPct(p.shareRate, 2)}</td>
                  <td className="px-4 py-3 text-right text-muted">{fmtPct(p.skipRate, 0)}</td>
                  <td className="px-4 py-3 text-right">
                    {p.link ? <a href={p.link} target="_blank" rel="noreferrer" className="inline-flex text-faint hover:text-ink"><ExternalLink size={15} /></a> : "—"}
                  </td>
                </tr>
              ))}
              {!topPosts.length && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-faint">ไม่มีข้อมูลโพสต์ใน filter นี้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 rounded-[24px] border border-line bg-surface p-5 shadow-soft">
        <div className="mb-3">
          <div className="text-[16px] font-extrabold text-ink">Monthly KPI plan</div>
          <div className="text-[12px] text-faint">วางเดือนเรียงต่อกันแบบ compact เพื่อดู Goal / Actual / Share / Skip ราย brand</div>
        </div>
        <div className="overflow-x-auto rounded-[16px] border border-line">
          <table className="w-full min-w-[860px] border-collapse text-[11.5px]">
            <thead>
              <tr className="bg-ivory text-faint">
                <th className="border-b border-line px-3 py-3 text-left font-extrabold">Brand</th>
                {months.map((m) => <th key={m} className="border-b border-l border-line px-3 py-3 text-center font-extrabold">{MONTH_LABELS[m] ?? m}</th>)}
              </tr>
            </thead>
            <tbody>
              {(brand === "all" ? brandCards.map((b) => b.id) : [brand as BrandId]).filter(Boolean).map((id) => (
                <tr key={id} className="border-b border-line4 last:border-0">
                  <td className="px-3 py-3 font-extrabold text-ink">
                    <div className="flex items-center gap-2"><BrandDot brand={id} size={8} />{brandName(id)}</div>
                  </td>
                  {months.map((m) => {
                    const r = monthlyRows.find((row) => row.brandId === id && row.month === m);
                    const pctReach = r?.kpiReach ? (r.actualReach / r.kpiReach) * 100 : 0;
                    return (
                      <td key={m} className="border-l border-line4 px-3 py-3 align-top">
                        {r ? (
                          <div>
                            <div className="font-extrabold text-ink">{num(r.actualReach)}</div>
                            <div className="text-[10.5px] text-faint">/{num(r.kpiReach)}</div>
                            <div className="mt-2 h-1.5 rounded-full bg-line overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, pctReach))}%`, background: ACCENT }} />
                            </div>
                            <div className="mt-1 text-[10.5px] text-faint">Share {fmtPct(r.actualShareRate, 2)} · Skip {fmtPct(r.actualSkipRate, 0)}</div>
                          </div>
                        ) : <span className="text-faint">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[20px] border border-[#BCEBE6] bg-white/78 p-4">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#0B7F7A]">{label}</div>
      <div className="mt-3 text-[26px] font-extrabold text-ink">{value}</div>
      <div className="mt-1 text-[11.5px] font-semibold text-faint">{hint}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-line2 bg-ivory px-3 py-3">
      <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-faint">{label}</div>
      <div className="mt-2 text-[16px] font-extrabold text-ink">{value}</div>
    </div>
  );
}

function HeroPost({ title, post, metric }: { title: string; post: PerformancePostRow | null; metric: string }) {
  return (
    <div className="rounded-[20px] border border-[#BCEBE6] bg-white/72 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#0B7F7A]">{title}</div>
        <div className="text-[18px] font-extrabold text-ink">{metric}</div>
      </div>
      {post ? (
        <div className="mt-3">
          <div className="flex items-center gap-2 text-[12px] text-muted">
            {post.brandId && <BrandDot brand={post.brandId} size={7} />}
            <span>{post.brandId ? brandName(post.brandId) : post.brand}</span>
            <span>·</span>
            <span style={{ color: sourceColor(post.source) }} className="font-bold">{post.source}</span>
          </div>
          <div className="mt-2 text-[13.5px] font-bold leading-relaxed text-ink">{brief(post.title)}</div>
          {post.link && <a href={post.link} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-[#0B7F7A]">Open post <ExternalLink size={13} /></a>}
        </div>
      ) : (
        <div className="mt-4 text-[12px] text-faint">ไม่มีข้อมูลใน filter นี้</div>
      )}
    </div>
  );
}
