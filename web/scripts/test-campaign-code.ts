/* Campaign running code: which number a module row resolves to, and when it
 * refuses to guess.
 * Run: node --import tsx scripts/test-campaign-code.ts */

import {
  buildCampaignCodeIndex, lookupCampaignCode, EMPTY_CODE_INDEX,
} from "../src/lib/data/campaignCode";
import { campaignLabel } from "../src/components/ui/CampaignCode";
import type { CampaignRow } from "../src/lib/data/campaigns";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) console.error(`    expected ${e}\n         got ${a}`);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

const camp = (over: Partial<CampaignRow>): CampaignRow => ({
  id: "CAM-2026-0001", name: "Seasonal menu", b: "teppen", branch: "", owner: "",
  budget: 0, spend: 0, roi: 0, dates: "", status: "Active", campType: "", readiness: "ready",
  taskBlocked: 0, taskWaiting: 0, taskOverdue: 0, taskTotal: 0, taskDone: 0, taskInProgress: 0,
  bottleneckTeam: "", nextApproval: "None", ...over,
});

console.log("\ncampaign code lookup");
{
  const index = buildCampaignCodeIndex([
    camp({ id: "CAM-2026-4770", name: "Seasonal menu", code: "TPN-2026-002", legacyCode: "CPN010" }),
    camp({ id: "CAM-2026-2676", name: "OTSUKARESAMA TIME", code: "TPN-2026-005" }),
  ]);
  is("by campaign id", lookupCampaignCode(index, "CAM-2026-4770"), "TPN-2026-002");
  is("by name when the row has no id", lookupCampaignCode(index, undefined, "Seasonal menu"), "TPN-2026-002");
  is("id wins over a name that points elsewhere",
    lookupCampaignCode(index, "CAM-2026-2676", "Seasonal menu"), "TPN-2026-005");
  is("unknown id falls back to the name",
    lookupCampaignCode(index, "CAM-2026-9999", "Seasonal menu"), "TPN-2026-002");
  is("unknown both", lookupCampaignCode(index, "CAM-2026-9999", "Nothing"), undefined);
  is("nothing to go on", lookupCampaignCode(index), undefined);
}

console.log("\nrefuses to guess");
{
  // Two campaigns really can share a name — that ambiguity is why the code
  // exists, so the name path must not pick a winner.
  const index = buildCampaignCodeIndex([
    camp({ id: "CAM-2026-0001", name: "Delivery", code: "TPN-2026-003" }),
    camp({ id: "CAM-2026-0002", name: "Delivery", code: "OMD-2026-009" }),
  ]);
  is("duplicated name resolves to no code", lookupCampaignCode(index, undefined, "Delivery"), undefined);
  is("each id still resolves", [
    lookupCampaignCode(index, "CAM-2026-0001"), lookupCampaignCode(index, "CAM-2026-0002"),
  ], ["TPN-2026-003", "OMD-2026-009"]);
}

console.log("\ncampaigns without a code");
{
  const index = buildCampaignCodeIndex([camp({ id: "CAM-2026-0003", name: "No code yet" })]);
  is("no pill rather than an empty one", lookupCampaignCode(index, "CAM-2026-0003"), undefined);
  is("empty index is safe", lookupCampaignCode(EMPTY_CODE_INDEX, "CAM-2026-0003", "No code yet"), undefined);
}

console.log("\nplain-text label");
{
  is("with a code", campaignLabel("TPN-2026-006", "KCC"), "#TPN-2026-006 · KCC");
  is("without one", campaignLabel(undefined, "KCC"), "KCC");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
