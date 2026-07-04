"use client";

import { useEffect, useState } from "react";
import { CampaignDetail, deriveDetail } from "@/lib/data/campaigns";
import { fetchCampaign } from "@/lib/db/campaigns";
import { CampaignDetailView } from "./CampaignDetailView";

/** Renders the statically-derived detail immediately (when the id is seeded),
 *  then refreshes from Supabase — and resolves campaigns created at runtime that
 *  have no static/mock entry. */
export function CampaignDetailClient({ id, initialDetail }: { id: string; initialDetail: CampaignDetail | null }) {
  const [detail, setDetail] = useState<CampaignDetail | null>(initialDetail);
  const [loading, setLoading] = useState(!initialDetail);

  useEffect(() => {
    let alive = true;
    fetchCampaign(id).then((c) => {
      if (!alive) return;
      if (c) setDetail(deriveDetail(c));
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { alive = false; };
  }, [id]);

  if (!detail) {
    return <div className="py-24 text-center text-[13px] text-faint">{loading ? "Loading…" : "Campaign not found."}</div>;
  }
  return <CampaignDetailView detail={detail} />;
}
