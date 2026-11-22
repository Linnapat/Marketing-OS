"use client";

// How many decisions are waiting on ME, per kind — the numbers beside Caption /
// Artwork / VDO in the sidebar.
//
// Same rows the Approval Center draws (useApprovalRows, mine only), so the
// badge and the queue cannot disagree. The reads behind an approval queue are
// not small, and the sidebar is on every page — so this waits until the page
// itself has had a moment to load, and useApprovalData keeps one shared copy
// for the session rather than fetching per page.

import { useEffect, useMemo, useState } from "react";
import { useApprovalData } from "@/lib/useApprovalData";
import { useApprovalRows } from "@/lib/useApprovalRows";
import { useMe } from "@/lib/useMe";
import type { ApprovalKind } from "@/lib/data/approvals";

const IDLE_MS = 2500;

export function useMyApprovalCounts(): Partial<Record<ApprovalKind, number>> {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), IDLE_MS);
    return () => clearTimeout(t);
  }, []);
  const me = useMe();
  const { data } = useApprovalData(ready);
  const rows = useApprovalRows({ ...data, viewAs: me });
  return useMemo(() => {
    const out: Partial<Record<ApprovalKind, number>> = {};
    for (const r of rows) if (r.mine && !r.autoClosed) out[r.kind] = (out[r.kind] ?? 0) + 1;
    return out;
  }, [rows]);
}
