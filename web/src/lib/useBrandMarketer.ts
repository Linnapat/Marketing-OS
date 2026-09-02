"use client";

// Who answers for a brand — the marketer the work is addressed to.
//
// Same resolution the graphic ladder and the campaign chain use
// (resolveBrandLead): a manager scoped to the brand first, else that brand's
// Marketing Executive, else nobody. Not "the first Marketing Manager in the
// member list", which named the Teppen · Mainichi manager on Omakase Don work
// — a brand her scope will not even let her open.
//
// Captions need it per row: a post raised by Creative or by the CMO still needs
// its own brand's marketer to accept the words, and "ฝ่ายวางแผน" as a group is
// not a person anybody can be waiting for.

import { useEffect, useMemo, useState } from "react";
import { fetchMembers, fetchBrandConfigs, Member } from "@/lib/db/settings";
import { BrandCfg } from "@/lib/data/settings";
import { resolveBrandLead } from "@/lib/db/assignments";
import { BrandId } from "@/lib/brands";

export function useBrandMarketer(): (b: BrandId) => string | null {
  const [members, setMembers] = useState<Member[]>([]);
  const [configs, setConfigs] = useState<BrandCfg[]>([]);
  useEffect(() => {
    let alive = true;
    Promise.all([fetchMembers(), fetchBrandConfigs().catch(() => [] as BrandCfg[])])
      .then(([ms, cfg]) => { if (alive) { setMembers(ms); setConfigs(cfg); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  // Cached per brand: the queue asks once per row and the answer only changes
  // when the member list does.
  return useMemo(() => {
    const seen = new Map<string, string | null>();
    return (b: BrandId) => {
      if (!members.length) return null;
      if (!seen.has(b)) seen.set(b, resolveBrandLead(b, members, configs.length ? configs : undefined));
      return seen.get(b) ?? null;
    };
  }, [members, configs]);
}
