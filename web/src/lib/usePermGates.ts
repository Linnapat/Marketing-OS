"use client";

// Client hook pairing the pure gates in lib/roleGates with the LIVE
// permissions matrix an admin saved in Settings → Permissions. Until the
// fetch resolves the seed matrix answers, so the gate is never open just
// because the network is slow.

import { useEffect, useState } from "react";
import { useRole } from "@/lib/role";
import { fetchPermissions } from "@/lib/db/settings";
import { canCreateCampaign, PermMatrix } from "@/lib/roleGates";

let _matrixCache: PermMatrix | null | undefined;

export function useCanCreateCampaign(): boolean {
  const { role } = useRole();
  const [matrix, setMatrix] = useState<PermMatrix | null>(_matrixCache ?? null);
  useEffect(() => {
    if (_matrixCache !== undefined) return;
    let alive = true;
    fetchPermissions().then((m) => {
      _matrixCache = m;
      if (alive) setMatrix(m);
    }).catch(() => { _matrixCache = null; });
    return () => { alive = false; };
  }, []);
  return canCreateCampaign(role, matrix);
}
