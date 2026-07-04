"use client";

import { useCallback, useEffect, useState } from "react";
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
    return <div className="py-24 text-center text-[13px] text-faint">{loading ? "Loading…" : "Campaign not found."}</div>;
  }
  return <CampaignDetailView detail={detail} hub={hub} onReload={reload} />;
}
