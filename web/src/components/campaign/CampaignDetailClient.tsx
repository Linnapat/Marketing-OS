"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CampaignDetail, deriveDetail } from "@/lib/data/campaigns";
import { fetchCampaign } from "@/lib/db/campaigns";
import { fetchCampaignHub, CampaignHub } from "@/lib/db/campaignHub";
import { fetchCampaignBrief } from "@/lib/db/brief";
import { CampaignBrief } from "@/lib/data/brief";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { CampaignDetailView } from "./CampaignDetailView";

/** Renders the statically-derived detail (when the id is seeded) immediately,
 *  then refreshes the campaign row and its linked records from Supabase. */
export function CampaignDetailClient({ id, initialDetail }: { id: string; initialDetail: CampaignDetail | null }) {
  const visibility = useBrandVisibility();
  const [detail, setDetail] = useState<CampaignDetail | null>(initialDetail);
  const [loading, setLoading] = useState(!initialDetail);
  const [hub, setHub] = useState<CampaignHub | null>(null);
  const [brief, setBrief] = useState<CampaignBrief | null>(null);

  const name = detail?.row.name;
  const reload = useCallback(() => {
    fetchCampaign(id).then((c) => {
      if (c) setDetail(deriveDetail(c));
    }).catch(() => {});
    fetchCampaignBrief(id).then(setBrief).catch(() => {});
    if (name) fetchCampaignHub(name).then(setHub).catch(() => {});
  }, [id, name]);

  useEffect(() => {
    let alive = true;
    fetchCampaign(id).then((c) => {
      if (!alive) return;
      if (c) setDetail(deriveDetail(c));
      setLoading(false);
    }).catch(() => setLoading(false));
    fetchCampaignBrief(id).then((b) => { if (alive) setBrief(b); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  // Brand scope: the campaign LIST filters what a member may not see, but this
  // page is reachable by URL — and campaign ids are sequential, so they are
  // guessable. Without this check a Marketing Manager scoped to two brands
  // could read any other brand's budget and spend (Broken Access Control,
  // found in live RBAC testing). Evaluated per render so it tightens the
  // moment the member's real scope finishes loading.
  if (detail && !visibility.isVisible(detail.row.b)) {
    return (
      <div className="py-24 flex flex-col items-center gap-4 text-center">
        <div className="text-[15px] font-bold text-ink">No access to this campaign</div>
        <div className="text-[13px] text-faint max-w-[420px]">แคมเปญนี้อยู่นอกขอบเขตแบรนด์ที่บัญชีของคุณดูแล — ติดต่อ CMO หากต้องการสิทธิ์</div>
        <Link href="/campaigns" className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[9px]">← กลับไปหน้า Campaigns</Link>
      </div>
    );
  }

  if (!detail) {
    if (loading) return <div className="py-24 text-center text-[13px] text-faint">Loading…</div>;
    return (
      <div className="py-24 flex flex-col items-center gap-4 text-center">
        <div className="text-[15px] font-bold text-ink">ไม่พบแคมเปญนี้</div>
        <div className="text-[13px] text-faint">แคมเปญที่คุณเปิดอาจถูกลบ หรือลิงก์ไม่ถูกต้อง</div>
        <Link href="/campaigns" className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[9px]">← กลับไปหน้า Campaigns</Link>
      </div>
    );
  }
  return <CampaignDetailView detail={detail} hub={hub} onReload={reload} brief={brief} onBriefChange={setBrief} />;
}
