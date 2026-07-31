"use client";

// One read of the campaign list, shared by every module that shows a campaign's
// running code (#TPN-2026-006) next to its name.
//
// Module-level cache for the same reason as useDeadlines: Content, Graphic and
// My Tasks can all be on screen in one session, and every row on each of them
// needs the same campaignId → code answer.
//
// The resolution rules live in lib/data/campaignCode (pure, tested); this hook
// only owns the fetch and the cache.

import { useEffect, useState } from "react";
import { fetchCampaigns } from "@/lib/db/campaigns";
import {
  CampaignCodeIndex, EMPTY_CODE_INDEX, buildCampaignCodeIndex, lookupCampaignCode,
} from "@/lib/data/campaignCode";

let _index: CampaignCodeIndex | null = null;
let _inflight: Promise<CampaignCodeIndex> | null = null;

async function loadIndex(): Promise<CampaignCodeIndex> {
  if (_index) return _index;
  if (_inflight) return _inflight;
  _inflight = fetchCampaigns()
    .then((rows) => { _index = buildCampaignCodeIndex(rows); return _index; })
    // A campaign list we cannot read must not break the page that was only
    // decorating a name with it: no code, same as a campaign that has none.
    .catch(() => { _index = EMPTY_CODE_INDEX; return _index; });
  return _inflight;
}

/** Forget the cached codes — call after creating or renaming a campaign. */
export function resetCampaignCodeCache(): void { _index = null; _inflight = null; }

/** `codeOf(campaignId, campaignName)` → "TPN-2026-006", or undefined until the
 *  list has loaded / when the campaign has no code. */
export function useCampaignCodes(): (id?: string, name?: string) => string | undefined {
  const [index, setIndex] = useState<CampaignCodeIndex | null>(_index);
  useEffect(() => {
    if (index) return;
    let alive = true;
    void loadIndex().then((i) => { if (alive) setIndex(i); });
    return () => { alive = false; };
  }, [index]);
  return (id, name) => (index ? lookupCampaignCode(index, id, name) : undefined);
}
