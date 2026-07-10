"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  Kol, KolPost, KOL_COMMENTS, DELIVERABLES, initials, fmtFollow, normalizeStage, kolPosts, postsTotals,
} from "@/lib/data/kol";
import { KOL_PLATFORMS } from "@/lib/data/brief";
import { canTransition, nextStage, nextActionFor, prerequisitesFor, hasOwner, canSaveResults } from "@/lib/kolFlow";
import { brandName, brandColor } from "@/lib/brands";
import { platformIcon, channelUrl } from "@/lib/platforms";
import { kolTone } from "@/lib/status";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { OwnerSelect } from "@/components/ui/OwnerSelect";
import { baht } from "@/lib/format";
import { updateKol } from "@/lib/db/kol";
import { logCollaboration, ensureKolProfile, searchKolProfiles, KolMasterRow } from "@/lib/db/kolMaster";
import { createTaskDb } from "@/lib/db/tasks";
import { Task } from "@/lib/data/tasks";

const TABS = [
  ["profile", "Profile"], ["campaign", "Campaign"], ["deliverables", "Deliverables"],
  ["brief", "Brief & Assets"], ["results", "Results"], ["comments", "Comments"],
] as const;
type DrawerTab = (typeof TABS)[number][0];

export function KolDrawer({ kol, initialTab = "profile", onClose, onUpdate }: { kol: Kol; initialTab?: DrawerTab; onClose: () => void; onUpdate?: (k: Kol) => void }) {
  const [tab, setTab] = useState<DrawerTab>(initialTab === "comments" ? "profile" : initialTab);
  const [comments, setComments] = useState(() => KOL_COMMENTS.filter((c) => c.kolId === kol.id));
  const deliverables = DELIVERABLES.filter((d) => d.kolId === kol.id);
  const pi = platformIcon(kol.plat);
  const openCount = comments.filter((c) => c.status === "Open").length;
  const currentStage = normalizeStage(kol.status);
  const workStages = ["Producing", "In Review", "Approved", "Posted", "Completed"];
  const visibleTabs = TABS.filter(([id]) => {
    if (id === "profile") return true;
    if (id === "campaign" || id === "comments") return false;
    if (id === "deliverables" || id === "brief") return workStages.includes(currentStage);
    if (id === "results") return currentStage === "Posted" || currentStage === "Completed";
    return false;
  });

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-[720px] bg-ivory shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-panel text-white px-6 pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-[14px] font-extrabold text-white" style={{ background: brandColor(kol.b) }}>
                {initials(kol.name)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[17px] font-extrabold">{kol.name}</span>
                  <span className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center text-[9px] font-bold" style={{ background: pi.bg, color: pi.fg }}>{pi.icon}</span>
                </div>
                <div className="text-[12px] text-white/50">
                  {channelUrl(kol.plat, kol.h)
                    ? <a href={channelUrl(kol.plat, kol.h)!} target="_blank" rel="noreferrer" className="text-white/80 font-semibold hover:underline">{kol.h} ↗</a>
                    : kol.h} · {brandName(kol.b)} · {kol.campaign}</div>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close KOL detail" className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0"><X size={18} /></button>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <StatusBadge tone={kolTone(kol.status)}>{kol.status}</StatusBadge>
            <span className="text-[11px] text-white/60">Owner {kol.owner}</span>
            {kol.pendingApprover !== "—" && <span className="text-[11px] text-white/60">· Approver {kol.pendingApprover}</span>}
            <span className="text-[11px] text-white/60">· Due {kol.postDueDate}</span>
          </div>
        </div>

        {/* Next-action bar — what to do now + missing prerequisites. */}
        <NextActionBar kol={kol} onUpdate={onUpdate} />

        {/* Tabs — horizontally scrollable so they never overflow the drawer. */}
        <div className="flex gap-1 px-4 overflow-x-auto border-b border-line bg-surface flex-shrink-0" style={{ scrollbarWidth: "thin" }}>
          {visibleTabs.map(([id, label]) => {
            const active = id === tab;
            return (
              <button key={id} onClick={() => setTab(id)}
                className="text-[12.5px] font-semibold px-[11px] py-[10px] whitespace-nowrap border-b-2 -mb-[1px] flex items-center gap-[6px] flex-shrink-0"
                style={active ? { color: "#211F1C", borderColor: "#B8945A" } : { color: "#9A9387", borderColor: "transparent" }}>
                {label}
                {id === "comments" && openCount > 0 && <span className="text-[9.5px] font-bold px-[6px] rounded-pill bg-status-red text-white">{openCount}</span>}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "profile" && <ProfileTab kol={kol} onUpdate={onUpdate} />}
          {tab === "campaign" && <CampaignTab kol={kol} />}
          {tab === "deliverables" && <DeliverablesTab items={deliverables} />}
          {tab === "brief" && <BriefTab kol={kol} />}
          {tab === "results" && <ResultsTab kol={kol} onUpdate={onUpdate} />}
          {tab === "comments" && <CommentsTab comments={comments} onResolve={(id) => setComments((cs) => cs.map((c) => c.id === id ? { ...c, status: "Resolved" } : c))} />}
        </div>
      </div>
    </div>
  );
}

// Next-action bar: what to do now + the exact prerequisites blocking the next
// stage. Always at the top of the drawer body.
function NextActionBar({ kol, onUpdate }: { kol: Kol; onUpdate?: (k: Kol) => void }) {
  const ns = nextStage(kol);
  const missing = ns ? prerequisitesFor(ns, kol) : [];
  const [busy, setBusy] = useState(false);
  const ownerMissing = !hasOwner(kol);

  const saveOwner = async (owner: string) => {
    const next: Kol = {
      ...kol,
      owner,
      currentBlocker: owner.trim() ? null : kol.currentBlocker,
      history: [...(kol.history ?? []), { type: "owner_assigned", at: new Date().toISOString(), by: owner, note: owner }],
    };
    setBusy(true);
    try { await updateKol(next); onUpdate?.(next); } finally { setBusy(false); }
  };

  const advance = async () => {
    if (!ns) return;
    const gate = canTransition(kol, ns);
    if (!gate.ok) return;
    const now = new Date().toISOString();
    const nextHistory: NonNullable<Kol["history"]> = [
      ...(kol.history ?? []),
      { type: "stage_changed", at: now, by: kol.owner || "System", from: kol.status, to: ns },
    ];
    if (ns === "Approved") nextHistory.push({ type: "approved", at: now, by: kol.pendingApprover || kol.owner || "System", note: ns });
    if (ns === "Posted") nextHistory.push({ type: "posted", at: now, by: kol.owner || "System", note: ns });
    const next: Kol = {
      ...kol,
      status: ns,
      currentBlocker: hasOwner(kol) ? null : kol.currentBlocker,
      postedDate: ns === "Posted" && !kol.postedDate ? now.slice(0, 10) : kol.postedDate,
      history: nextHistory,
    };
    setBusy(true);
    try { await updateKol(next); onUpdate?.(next); } finally { setBusy(false); }
  };

  return (
    <div className="bg-ivory border-b border-line px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="text-[14px] mt-[1px]">🧭</span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.05em] text-faint font-bold">Next action</div>
          <div className="text-[12.5px] text-ink font-semibold">{nextActionFor(kol)}</div>
          {ownerMissing ? (
            <div className="mt-2 max-w-[320px]">
              <OwnerSelect value="" onChange={saveOwner} team="KOL" />
              <div className="text-[10.5px] text-faint mt-1">เลือกผู้รับผิดชอบแล้วระบบจะบันทึกทันที</div>
            </div>
          ) : (
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {ns && (
                <button onClick={advance} disabled={busy || missing.length > 0}
                  title={missing.length ? `ยังขาด: ${missing.join(" · ")}` : ""}
                  className="text-[12px] font-bold text-white bg-panel rounded-[9px] px-4 py-[8px] disabled:opacity-40">
                  {busy ? "Saving…" : `Continue → ${ns}`}
                </button>
              )}
              {missing.length > 0 && <span className="text-[11px] text-status-red">ยังขาด: {missing.join(" · ")}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Advance this KOL through the guarded lifecycle, and manage its per-platform
// posts (each with its own link). Every stage change is validated by
// canTransition (same rule the backend enforces) — invalid targets are disabled.
function StageBar({ kol, onUpdate }: { kol: Kol; onUpdate?: (k: Kol) => void }) {
  const [posts, setPosts] = useState<KolPost[]>(() => kolPosts(kol));
  const [busy, setBusy] = useState(false);
  const showDeliverables = ["Negotiating", "Contract Signed", "Producing", "In Review", "Approved", "Posted", "Completed"].includes(normalizeStage(kol.status));

  const persist = async (nextPosts: KolPost[]) => {
    const totals = postsTotals(nextPosts);
    const next: Kol = { ...kol, posts: nextPosts, postLink: nextPosts[0]?.link || kol.postLink, actualReach: totals.reach, actualEngagement: totals.engagement };
    setBusy(true);
    try { await updateKol(next); onUpdate?.(next); } finally { setBusy(false); }
  };
  const editPost = (i: number, patch: Partial<KolPost>) => setPosts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addPost = () => setPosts((ps) => [...ps, { platform: KOL_PLATFORMS[0], link: "" }]);
  const removePost = (i: number) => { const next = posts.filter((_, j) => j !== i); setPosts(next); persist(next); };

  if (!showDeliverables) return null;

  return (
    <div className="bg-surface border-b border-line px-4 py-3">
      <div className="flex items-center justify-between mb-[6px]">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.05em] text-faint font-bold">Post / Draft links</div>
          <div className="text-[10.5px] text-faint">เพิ่ม Platform ที่เสนอได้ตั้งแต่ขั้นเจรจา เพื่อใช้ทำ Proposal</div>
        </div>
        <button onClick={addPost} disabled={busy}
          className="text-[12px] font-bold text-panel bg-white border border-panel rounded-[9px] px-3 py-[7px] shadow-sm hover:bg-ivory disabled:opacity-40">
          + Add Platform / Link
        </button>
      </div>
      <div className="flex flex-col gap-[6px]">
        {posts.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <select value={p.platform} onChange={(e) => editPost(i, { platform: e.target.value })} onBlur={() => persist(posts)}
              className="text-[12px] font-semibold px-[8px] py-[6px] rounded-[8px] border border-line2 bg-ivory outline-none">
              {[...new Set([p.platform, ...KOL_PLATFORMS])].map((pl) => <option key={pl} value={pl}>{pl}</option>)}
            </select>
            <input value={p.link} onChange={(e) => editPost(i, { link: e.target.value })} onBlur={() => persist(posts)}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              placeholder="Proposal / draft / post link (optional)…" className="flex-1 text-[12px] px-3 py-[6px] rounded-[8px] border border-line2 bg-ivory outline-none" />
            {p.link && <a href={p.link.startsWith("http") ? p.link : `https://${p.link}`} target="_blank" rel="noreferrer" className="text-[11px] text-accent font-bold">↗</a>}
            <button onClick={() => removePost(i)} className="text-[12px] text-status-red font-bold" aria-label="Remove post">✕</button>
          </div>
        ))}
        {posts.length === 0 && <div className="text-[11.5px] text-faint">ยังไม่มีโพสต์ — เพิ่ม platform และลิงก์ก่อนส่ง In Review</div>}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.05em] text-faint font-bold mb-[3px]">{label}</div>
      <div className="text-[13.5px] text-ink">{value}</div>
    </div>
  );
}

function ProfileTab({ kol, onUpdate }: { kol: Kol; onUpdate?: (k: Kol) => void }) {
  const [name, setName] = useState(kol.name);
  const [handle, setHandle] = useState(kol.h);
  const [kolType, setKolType] = useState(kol.kolType);
  const [followers, setFollowers] = useState(kol.followers || 0);
  const [avgReach, setAvgReach] = useState(kol.expectedReach || 0);
  const [audienceFit, setAudienceFit] = useState(kol.audienceFit);
  const [contentStyle, setContentStyle] = useState(kol.contentStyle);
  const [pastCollab, setPastCollab] = useState(kol.pastCollab);
  const [contactInfo, setContactInfo] = useState(kol.contactInfo);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryRows, setLibraryRows] = useState<KolMasterRow[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedMasterId, setSelectedMasterId] = useState(kol.masterKolId);

  useEffect(() => {
    let alive = true;
    const q = libraryQuery.trim();
    if (q.length < 2) { setLibraryRows([]); setLibraryLoading(false); return; }
    setLibraryLoading(true);
    const timer = setTimeout(() => {
      searchKolProfiles(q, 8)
        .then((rows) => { if (alive) { setLibraryRows(rows); setLibraryLoading(false); } })
        .catch(() => { if (alive) { setLibraryRows([]); setLibraryLoading(false); } });
    }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [libraryQuery]);

  const chooseLibraryKol = (row: KolMasterRow) => {
    setName(row.display_name || "");
    setHandle(row.primary_handle || "");
    setKolType(row.kol_type || "");
    setFollowers(row.total_followers || 0);
    setSelectedMasterId(row.kol_id);
    setLibraryQuery(row.display_name || row.primary_handle || "");
    setLibraryRows([]);
  };

  const save = async () => {
    setBusy(true);
    // One final submit: save profile + proposal, then route it back to the
    // original requester in My Approval. Repeated clicks reuse the same task id.
    const masterKolId = await ensureKolProfile({ masterKolId: selectedMasterId, name, handle, kolType, followers, platform: kol.plat }).catch(() => selectedMasterId);
    const taskId = kol.proposalApprovalTaskId ?? Date.now();
    const requester = (kol.requester || kol.pendingApprover || "").trim();
    const next: Kol = {
      ...kol, name: name.trim() || kol.name, h: handle.trim() || kol.h, kolType,
      followers, expectedReach: avgReach, audienceFit, contentStyle, pastCollab,
      contactInfo, masterKolId: masterKolId ?? kol.masterKolId,
      quotationStatus: "Pending Approval",
      proposalApprovalTaskId: taskId,
      proposalSubmittedAt: new Date().toISOString(),
      history: [...(kol.history ?? []), { type: "proposal_submitted", at: new Date().toISOString(), by: kol.owner || "System", note: name.trim() || kol.name }],
    };
    try {
      await updateKol(next);
      if (!kol.proposalApprovalTaskId && requester && requester !== "Unassigned" && requester !== "—") {
        const due = new Date(); due.setDate(due.getDate() + 3);
        const task: Task = {
          id: taskId, title: `Approve KOL proposal — ${next.name}`,
          module: "KOL", moduleIcon: "🌟", moduleColor: "#B5577E", type: "KOL",
          assignee: requester, brand: brandName(next.b), campaign: next.campaign,
          status: "Need Approval", priority: "High", group: "needApproval",
          due: due.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
          dueIso: due.toISOString().slice(0, 10), blocker: null,
          pendingApprover: requester, isQuickWin: false,
          nextAction: `Review profile, platforms and proposal budget ${baht(next.fee, { compact: true })}. Approve or request revision.`,
          checklist: ["Check KOL profile & followers", "Check platforms / links", "Check proposal budget & food support"],
          relatedKolId: next.id, approvalKind: "kolProposal",
        };
        await createTaskDb(task);
      }
      onUpdate?.(next); setSaved(true); setTimeout(() => setSaved(false), 2500);
    } finally { setBusy(false); }
  };

  const field = "w-full text-[13.5px] px-[12px] py-[9px] rounded-[9px] border border-line2 bg-ivory outline-none";
  const lbl = "block text-[10.5px] uppercase tracking-[0.05em] text-faint font-bold mb-[4px]";
  const AUDIENCE = ["Very High", "High", "Medium", "Low", "TBD"];
  const audienceOptions = AUDIENCE.includes(audienceFit) ? AUDIENCE : [audienceFit, ...AUDIENCE];
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-line bg-surface p-3">
        <label className={lbl}>Search KOL Library</label>
        <input value={libraryQuery} onChange={(e) => setLibraryQuery(e.target.value)}
          className={field} placeholder="พิมพ์ชื่อหรือ @handle เพื่อดึงข้อมูลเดิม…" />
        {libraryLoading && <div className="text-[11px] text-faint mt-2">กำลังค้นหา…</div>}
        {libraryRows.length > 0 && (
          <div className="mt-2 border border-line rounded-[9px] overflow-hidden bg-white">
            {libraryRows.map((row) => (
              <button key={row.kol_id} type="button" onClick={() => chooseLibraryKol(row)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left border-b border-line4 last:border-0 hover:bg-ivory">
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-bold text-ink truncate">{row.display_name}</span>
                  <span className="block text-[11px] text-faint truncate">{row.primary_handle || "ไม่มี handle"} · {row.kol_type || "ไม่ระบุประเภท"}</span>
                </span>
                <span className="text-[11px] font-bold text-accent flex-shrink-0">เลือก →</span>
              </button>
            ))}
          </div>
        )}
        {selectedMasterId && <div className="text-[11px] font-semibold text-status-green mt-2">✓ เชื่อมกับ KOL Library แล้ว</div>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className={lbl}>KOL / Page Name</label><input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="e.g. Tokyo Tom" /></div>
        <div><label className={lbl}>Page / Handle</label><input value={handle} onChange={(e) => setHandle(e.target.value)} className={field} placeholder="@handle or URL" /></div>
        <div className="col-span-2 -mx-1">
          <StageBar kol={kol} onUpdate={onUpdate} />
        </div>
        <div><label className={lbl}>KOL Type</label><input value={kolType} onChange={(e) => setKolType(e.target.value)} className={field} placeholder="e.g. Food Blogger" /></div>
        <div><label className={lbl}>Followers</label><input type="number" value={followers || ""} onChange={(e) => setFollowers(parseInt(e.target.value) || 0)} className={field} placeholder="0" /></div>
        <div><label className={lbl}>Avg Reach</label><input type="number" value={avgReach || ""} onChange={(e) => setAvgReach(parseInt(e.target.value) || 0)} className={field} placeholder="0" /></div>
        <div><label className={lbl}>Audience Fit</label><select value={audienceFit} onChange={(e) => setAudienceFit(e.target.value)} className={field}>{audienceOptions.map((a) => <option key={a}>{a}</option>)}</select></div>
      </div>
      <div><label className={lbl}>Content Style</label><input value={contentStyle} onChange={(e) => setContentStyle(e.target.value)} className={field} placeholder="e.g. Food photography + short video" /></div>
      <div><label className={lbl}>Past Collaboration</label><input value={pastCollab} onChange={(e) => setPastCollab(e.target.value)} className={field} placeholder="e.g. Wagyu teaser Jun 2025 — 3.8× ROI" /></div>
      <div><label className={lbl}>Contact / Agency</label><input value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} className={field} placeholder="Agency / email / phone" /></div>
      <div className="border-t border-line pt-4">
        <div className="text-[13px] font-extrabold text-ink mb-3">Proposal & Contract</div>
        <ContractTab kol={kol} onUpdate={onUpdate} embedded />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={save} disabled={busy} className="text-[13px] font-bold text-white bg-panel rounded-[10px] px-5 py-[10px] disabled:opacity-50">{busy ? "Submitting…" : "Submit Profile & Proposal"}</button>
        {saved && <span className="text-[12.5px] font-semibold text-status-green">✓ ส่งไป My Approval แล้ว</span>}
        {!kol.requester && <span className="text-[11px] text-status-red">ไม่พบ Requester — ระบบจะใช้ Approver ที่กำหนดไว้แทน</span>}
      </div>
    </div>
  );
}

function CampaignTab({ kol }: { kol: Kol }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Campaign" value={kol.campaign} />
      <Field label="Branch / Store" value={kol.branch} />
      <Field label="Objective" value={kol.objective} />
      <Field label="Target Audience" value={kol.target} />
      <div className="col-span-2"><Field label="Key Message" value={kol.keyMsg} /></div>
      <div className="col-span-2"><Field label="Offer" value={kol.offer} /></div>
      <Field label="Posting Period" value={kol.postingPeriod} />
      <Field label="Coupon Code" value={kol.couponCode ?? "—"} />
    </div>
  );
}

function DeliverablesTab({ items }: { items: typeof DELIVERABLES }) {
  if (!items.length) return <Empty note="No deliverables defined yet." />;
  return (
    <div className="flex flex-col gap-3">
      {items.map((d) => (
        <div key={d.id} className="bg-surface border border-line rounded-card p-4">
          <div className="flex items-center justify-between">
            <div className="text-[13.5px] font-bold text-ink">{d.type}</div>
            <StatusBadge tone={kolTone(d.status)}>{d.status}</StatusBadge>
          </div>
          <div className="flex items-center gap-4 mt-2 text-[11.5px] text-faint flex-wrap">
            <span>{d.platform}</span><span>Qty {d.qty}</span><span>Due {d.due}</span>
            {d.pendingApprover && d.pendingApprover !== "—" && <span>Approver {d.pendingApprover}</span>}
            {d.openComments > 0 && <span className="text-status-red font-semibold">💬 {d.openComments}</span>}
          </div>
          <div className="flex items-center gap-3 mt-2">
            {d.draftLink && <span className="text-[11.5px] text-accent font-semibold cursor-pointer">Draft ↗</span>}
            {d.finalPostLink && <span className="text-[11.5px] text-accent font-semibold cursor-pointer">Final post ↗</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function BriefTab({ kol }: { kol: Kol }) {
  const links = [
    ["Brief link", "#brief"], ["Asset folder", "#assets"], ["Draft content", kol.stages.find((s) => s.l === "Create")?.done ? "#draft" : null],
    ["Caption / script", "#caption"], ["Final post link", kol.postLink], ["UTM link", kol.couponCode ? "#utm" : null],
  ] as const;
  return (
    <div className="flex flex-col gap-2">
      {links.map(([label, href]) => (
        <div key={label} className="flex items-center justify-between bg-surface border border-line rounded-card px-4 py-3">
          <span className="text-[13px] text-ink">{label}</span>
          {href ? <span className="text-[12px] text-accent font-semibold cursor-pointer">Open ↗</span> : <span className="text-[12px] text-faint">Not added</span>}
        </div>
      ))}
    </div>
  );
}

// Contract + Quotation are the KOL team's to set (they gate Contract Signed).
// Invoice + Payment mirror Finance — read-only here, actioned via the CTA.
const CONTRACT_OPTS = ["Pending", "Sent", "Signed"];
// KOL deals use a rate card / proposal rather than a formal vendor quotation.
const RATECARD_OPTS = ["Pending", "Received", "Approved"];
function ContractTab({ kol, onUpdate, embedded = false }: { kol: Kol; onUpdate?: (k: Kol) => void; embedded?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [proposalBudget, setProposalBudget] = useState(kol.fee || 0);
  const [foodSupport, setFoodSupport] = useState(kol.foodCost || 0);
  const isPaid = /paid/i.test(kol.paymentStatus);
  const set = async (patch: Partial<Kol>) => {
    setBusy(true);
    const next = { ...kol, ...patch } as Kol;
    if (patch.quotationStatus && patch.quotationStatus !== kol.quotationStatus && /approved/i.test(patch.quotationStatus)) {
      next.history = [...(kol.history ?? []), { type: "approved", at: new Date().toISOString(), by: kol.pendingApprover || kol.owner || "System", note: patch.quotationStatus }];
    }
    try { await updateKol(next); onUpdate?.(next); } finally { setBusy(false); }
  };
  const saveProposalBudget = async () => {
    const fee = Math.max(0, proposalBudget || 0);
    await set({ fee, totalCost: fee + Math.max(0, foodSupport || 0) });
  };
  const saveFoodSupport = async () => {
    const foodCost = Math.max(0, foodSupport || 0);
    await set({ foodCost, totalCost: Math.max(0, proposalBudget || 0) + foodCost });
  };
  const selCls = "text-[12px] font-semibold px-[10px] py-[6px] rounded-[8px] border border-line2 bg-ivory outline-none";
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card p-3 text-[11.5px]" style={{ background: "#FBF8EE", border: "1px solid #E8CCA0", color: "#8A6D1E" }}>
        ค่าตัว KOL นับเป็น <b>Committed (แผน)</b> เท่านั้น — ยังไม่ถือเป็น Actual Spend จนกว่าจะมี Expense/Payment ที่อนุมัติใน Finance
      </div>

      {/* Editable — these two unlock "Contract Signed" */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between bg-surface border border-line rounded-card px-4 py-[10px]">
          <div><div className="text-[13px] text-ink font-semibold">Contract</div><div className="text-[10.5px] text-faint">ต้องเป็น Signed เพื่อไป Contract Signed</div></div>
          <select value={kol.contractStatus} disabled={busy} onChange={(e) => set({ contractStatus: e.target.value })} className={selCls}>
            {[...new Set([kol.contractStatus, ...CONTRACT_OPTS])].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between bg-surface border border-line rounded-card px-4 py-[10px]">
          <div><div className="text-[13px] text-ink font-semibold">Rate Card / Proposal</div><div className="text-[10.5px] text-faint">ต้องเป็น Approved เพื่อไป Contract Signed</div></div>
          <select value={kol.quotationStatus} disabled={busy} onChange={(e) => set({ quotationStatus: e.target.value })} className={selCls}>
            {[...new Set([kol.quotationStatus, ...RATECARD_OPTS])].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {/* Read-only — mirrors Finance */}
      <div className="flex flex-col gap-2">
        {([["Invoice", kol.invoiceStatus], ["Payment", kol.paymentStatus]] as [string, string][]).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between bg-surface border border-line rounded-card px-4 py-3">
            <span className="text-[13px] text-ink">{k} <span className="text-[10.5px] text-faint">· จาก Finance</span></span>
            <StatusBadge tone={kolTone(v)}>{v}</StatusBadge>
          </div>
        ))}
      </div>

      <div className="rounded-card border border-accent-border bg-status-goldBg p-3">
        <label className="block text-[10.5px] uppercase tracking-[0.05em] text-status-gold font-bold mb-[5px]">Proposal Budget (Total)</label>
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-ink">฿</span>
          <input type="number" min={0} value={proposalBudget || ""}
            onChange={(e) => setProposalBudget(Number(e.target.value) || 0)}
            onBlur={saveProposalBudget}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="flex-1 text-[14px] font-bold px-3 py-2 rounded-[9px] border border-accent-border bg-white outline-none"
            placeholder="ใส่งบที่เสนอทั้งหมด" />
          <span className="text-[11px] text-status-gold">{busy ? "Saving…" : "บันทึกอัตโนมัติ"}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-accent-border">
          <div>
            <label className="block text-[10.5px] uppercase tracking-[0.05em] text-faint font-bold mb-[5px]">Food Support</label>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-ink">฿</span>
              <input type="number" min={0} value={foodSupport || ""}
                onChange={(e) => setFoodSupport(Number(e.target.value) || 0)}
                onBlur={saveFoodSupport}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="w-full text-[13px] font-semibold px-3 py-2 rounded-[9px] border border-accent-border bg-white outline-none"
                placeholder="ค่าอาหาร / สินค้าสนับสนุน" />
            </div>
          </div>
          <Field label="Total Cost" value={baht(proposalBudget + foodSupport, { compact: true })} />
        </div>
      </div>
      <Field label="Payment Due" value={kol.paymentDue} />
      {!embedded && (
        <a href="/expenses" className="text-[12.5px] font-bold text-white bg-panel rounded-[10px] px-4 py-[10px] text-center">
          {isPaid ? "ดูรายการใน Finance / Expenses →" : "เปิดคำขอเบิก/ชำระเงินใน Finance / Expenses →"}
        </a>
      )}
    </div>
  );
}

function ResultsTab({ kol, onUpdate }: { kol: Kol; onUpdate?: (k: Kol) => void }) {
  const [reach, setReach] = useState(kol.actualReach || 0);
  const [eng, setEng] = useState(kol.actualEngagement || 0);
  const [link, setLink] = useState(kol.postLink ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  // "Log to master" — extra fields the collaboration-history record needs.
  const [onTime, setOnTime] = useState(true);
  const [feedback, setFeedback] = useState(0); // 0 = not rated
  const [logging, setLogging] = useState(false);
  const [logged, setLogged] = useState(false);

  const logToMaster = async () => {
    if (!kol.masterKolId) return;
    setLogging(true);
    try {
      await logCollaboration({
        kol_id: kol.masterKolId,
        brand: kol.b,
        fee_paid: kol.fee || undefined,
        deliverables: kol.contentStyle || undefined,
        actual_reach: reach || undefined,
        actual_engagement: eng || undefined,
        roas: kol.roi || undefined,
        on_time_delivery: onTime,
        brand_feedback_score: feedback || undefined,
      });
      setLogged(true); setTimeout(() => setLogged(false), 2500);
    } finally { setLogging(false); }
  };

  // Cost efficiency auto-derives from the entered actuals + the total cost.
  const costPerReach = reach ? kol.totalCost / reach : 0;
  const costPerEng = eng ? kol.totalCost / eng : 0;
  const cpv = kol.visits ? Math.round(kol.totalCost / kol.visits) : 0;
  // Engagement rate: engagement ÷ reach, falling back to followers. Always %.
  const engBase = reach > 0 ? reach : (kol.followers || 0);
  const engRate = engBase ? (eng / engBase) * 100 : 0;

  // Results may only be saved once Posted/Completed with a final link — the
  // stage itself is advanced (with its own guards) in the Stage bar, not here.
  const gate = canSaveResults({ ...kol, postLink: link.trim() || kol.postLink });
  const save = async () => {
    if (!gate.ok) { alert(gate.reason ?? "บันทึกผลยังไม่ได้"); return; }
    setBusy(true);
    const now = new Date().toISOString();
    const stage = normalizeStage(kol.status);
    const shouldLogPosted = !!link.trim() && !(kol.history ?? []).some((e) => e.type === "posted");
    const next: Kol = {
      ...kol, actualReach: reach, actualEngagement: eng,
      engagement: eng ? fmtFollow(eng) : kol.engagement,
      postLink: link.trim() || null,
      postedDate: link.trim() && !kol.postedDate ? now.slice(0, 10) : kol.postedDate,
      history: [
        ...(kol.history ?? []),
        ...(shouldLogPosted
          ? [{ type: "posted", at: now, by: kol.owner || "System", note: stage } as const]
          : []),
      ],
    };
    try {
      await updateKol(next); onUpdate?.(next); setSaved(true); setTimeout(() => setSaved(false), 2000);
      // Completed collaboration → keep the KOL Library / master history current.
      if (normalizeStage(kol.status) === "Completed" && kol.masterKolId) logToMaster().catch(() => {});
    } finally { setBusy(false); }
  };

  const field = "w-full text-[13.5px] px-[12px] py-[9px] rounded-[9px] border border-line2 bg-ivory outline-none";
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-faint mb-[5px]">Actual Reach</label>
          <input type="number" value={reach || ""} onChange={(e) => setReach(parseInt(e.target.value) || 0)} className={field} placeholder="0" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-faint mb-[5px]">Actual Engagement</label>
          <input type="number" value={eng || ""} onChange={(e) => setEng(parseInt(e.target.value) || 0)} className={field} placeholder="0" />
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-bold text-faint mb-[5px]">Result / Post Link</label>
        <input value={link} onChange={(e) => setLink(e.target.value)} className={field} placeholder="https://…" />
      </div>

      {/* Auto-derived cost efficiency */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Reach", fmtFollow(reach)], ["Engagement", eng ? fmtFollow(eng) : "—"],
          ["Eng. Rate", engBase ? `${engRate.toFixed(2)}%` : "—"],
          ["Cost / Reach", costPerReach ? baht(Math.round(costPerReach * 100) / 100) : "—"],
          ["Cost / Eng.", costPerEng ? baht(Math.round(costPerEng * 100) / 100) : "—"],
          ["Visits", String(kol.visits)], ["CPV", cpv ? baht(cpv) : "—"],
          ["ROI", kol.roi ? `${kol.roi}×` : "—"], ["Posted", kol.postedDate ?? "—"],
        ].map(([label, val]) => (
          <div key={label} className="bg-surface border border-line rounded-card p-3">
            <div className="text-[10px] uppercase tracking-[0.05em] text-faint font-bold mb-[4px]">{label}</div>
            <div className="text-[15px] font-bold text-ink">{val}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={save} disabled={busy || !gate.ok} title={gate.ok ? "" : gate.reason} className="text-[13px] font-bold text-white bg-panel rounded-[10px] px-5 py-[10px] disabled:opacity-50">
          {busy ? "Saving…" : "Save Results"}
        </button>
        {saved && <span className="text-[12.5px] font-semibold text-status-green">✓ Saved</span>}
        {!gate.ok && <span className="text-[11.5px] text-status-red">{gate.reason}</span>}
      </div>

      {/* Log to master database — records a collaboration and recomputes rank. */}
      <div className="border-t border-line pt-4 mt-1">
        <div className="text-[12.5px] font-extrabold text-ink mb-1">Log to master database</div>
        <div className="text-[11.5px] text-faint mb-3">บันทึกผลงานจริงเข้าประวัติของ KOL รายนี้ แล้วคำนวณ Rank ใหม่ (ใช้ตอนเลือกครั้งต่อไป)</div>
        {kol.masterKolId ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[11px] font-bold text-faint mb-[5px]">On-time delivery</label>
                <select value={onTime ? "yes" : "no"} onChange={(e) => setOnTime(e.target.value === "yes")} className={field}>
                  <option value="yes">ตรงเวลา</option>
                  <option value="no">ล่าช้า</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-faint mb-[5px]">Brand feedback (1–5)</label>
                <select value={feedback} onChange={(e) => setFeedback(parseInt(e.target.value))} className={field}>
                  <option value={0}>ยังไม่ให้คะแนน</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"⭐️".repeat(n)} ({n})</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={logToMaster} disabled={logging} className="text-[13px] font-bold text-panel border border-panel rounded-[10px] px-5 py-[10px] disabled:opacity-50">
                {logging ? "Logging…" : "Log & recompute rank"}
              </button>
              {logged && <span className="text-[12.5px] font-semibold text-status-green">✓ Logged · rank updated</span>}
            </div>
          </>
        ) : (
          <div className="text-[11.5px] text-faint bg-surface border border-line rounded-card p-3">
            KOL รายนี้ยังไม่ได้เชื่อมกับ master profile — สร้างผ่านฟอร์ม Request KOL (ค้นหา/สร้างใหม่) เพื่อให้บันทึกประวัติได้
          </div>
        )}
      </div>
    </div>
  );
}

function CommentsTab({ comments, onResolve }: { comments: typeof KOL_COMMENTS; onResolve: (id: number) => void }) {
  if (!comments.length) return <Empty note="No comments yet." />;
  return (
    <div className="flex flex-col gap-3">
      {comments.map((c) => (
        <div key={c.id} className="bg-surface border border-line rounded-card p-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: c.ownerColor }}>{initials(c.owner)}</span>
            <span className="text-[12.5px] font-bold text-ink">{c.owner}</span>
            <span className="text-[10.5px] text-faint">{c.ownerTeam} · {c.createdAt}</span>
            <StatusBadge tone={kolTone(c.status)} className="ml-auto">{c.status}</StatusBadge>
          </div>
          <div className="text-[12.5px] text-muted leading-[1.5]">{c.text}</div>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-faint">
            <span className="px-[7px] py-[1px] rounded-pill bg-ivory border border-line3">{c.type}</span>
            <span>→ {c.assignedTo}</span>
            {c.due && <span>Due {c.due}</span>}
            {c.status === "Open" && (
              <button onClick={() => onResolve(c.id)} className="ml-auto text-[11px] font-bold text-status-green">Resolve ✓</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ note }: { note: string }) {
  return <div className="text-[13px] text-faint text-center py-10">{note}</div>;
}
