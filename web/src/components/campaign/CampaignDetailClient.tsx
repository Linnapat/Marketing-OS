"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CampaignDetail, deriveDetail } from "@/lib/data/campaigns";
import { fetchCampaign } from "@/lib/db/campaigns";
import { fetchCampaignHub, CampaignHub } from "@/lib/db/campaignHub";
import { CampaignDetailView } from "./CampaignDetailView";

/** Renders the statically-derived detail (when the id is seeded) immediately,
 *  then refreshes the campaign row and its linked records from Supabase. */
export function CampaignDetailClient({ id, initialDetail }: { id: string; initialDetail: CampaignDetail | null }) {
  const [detail, setDetail] = useState<CampaignDetail | null>(initialDetail);
  const [loading, setLoading] = useState(!initialDetail);
  const [hub, setHub] = useState<CampaignHub | null>(null);

  const name = detail?.row.name;
  const reload = useCallback(() => {
    if (name) fetchCampaignHub(name).then(setHub).catch(() => {});
  }, [name]);

  useEffect(() => {
    let alive = true;
    fetchCampaign(id).then((c) => {
      if (!alive) return;
      if (c) setDetail(deriveDetail(c));
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { alive = false; };
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

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
  return <CampaignDetailView detail={detail} hub={hub} onReload={reload} />;
}
