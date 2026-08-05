"use client";

// Client hooks pairing the pure gates in lib/roleGates with the LIVE
// permissions matrix an admin saved in Settings → Permissions. Until the
// fetch resolves the seed matrix answers, so the gate is never open just
// because the network is slow.

import { useEffect, useState } from "react";
import { useRole } from "@/lib/role";
import { fetchPermissions } from "@/lib/db/settings";
import {
  canCreateCampaign,
  canMakeApprovedPlan,
  canApproveExpense,
  canSeeAllSpending,
  canMarkPaid,
  PermMatrix,
} from "@/lib/roleGates";

let _matrixCache: PermMatrix | null | undefined;

/** The saved permissions matrix, fetched once per page load and shared by
 *  every gate below (one request, not one per hook). */
function usePermMatrix(): PermMatrix | null {
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
  return matrix;
}

export function useCanCreateCampaign(): boolean {
  const { role } = useRole();
  return canCreateCampaign(role, usePermMatrix());
}

/** May the current user re-run the fan-out for an approved campaign whose plan
 *  never became work? Mirrors campaigns' INSERT policy (Campaign ≥ Edit), which
 *  the fan-out's first write has to satisfy. */
export function useCanMakeApprovedPlan(): boolean {
  const { role } = useRole();
  return canMakeApprovedPlan(role, usePermMatrix());
}

/** May the current user decide an expense request? Mirrors the database rule
 *  (has_module('Finance','Approve') + the CMO check inside the RPC) so the
 *  button and the row policy cannot drift apart. */
export function useCanApproveExpense(): boolean {
  const { role } = useRole();
  return canApproveExpense(role, usePermMatrix());
}

/** May the current user see company-wide spending? Submitting your OWN expense
 *  request does not require this — everyone may do that. */
export function useCanSeeAllSpending(): boolean {
  const { role } = useRole();
  return canSeeAllSpending(role, usePermMatrix());
}

/** May the current user mark a Spending Log row Paid? Named-role rule (see
 *  canMarkPaid), mirrored by the expenses_paid_guard trigger. */
export function useCanMarkPaid(): boolean {
  const { role } = useRole();
  return canMarkPaid(role);
}
