"use client";

import { useEffect, useState } from "react";
import { CampaignDetail, deriveDetail } from "@/lib/data/campaigns";
import { fetchCampaign } from "@/lib/db/campaigns";
import { CampaignDetailView } from "./CampaignDetailView";

/** Renders the statically-derived detail immediately, then refreshes from
 *  Supabase so edits to the campaign row show up live. */
export function CampaignDetailClient({ id, initialDetail }: { id: string; initialDetail: CampaignDetail }) {
  const [detail, setDetail] = useState(initialDetail);

  useEffect(() => {
    let alive = true;
    fetchCampaign(id).then((c) => { if (alive && c) setDetail(deriveDetail(c)); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);

  return <CampaignDetailView detail={detail} />;
}
