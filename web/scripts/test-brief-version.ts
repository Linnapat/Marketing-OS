/* The row-version marker behind the campaign brief's conflict check.
 * Run: node --import tsx scripts/test-brief-version.ts
 *
 * The bug this guards: our OWN write to a campaigns row moves updated_at, and a
 * marker left pointing at the row as it was before that write turns the very
 * next save into a false "somebody else edited this" conflict. Live effect —
 * every campaign approved after campaign_concurrency.sql went in on 2026-07-29
 * materialised nothing: logBriefApproval wrote the status, saveCampaignBrief
 * ran straight after it, and the brief-blob write was refused before a single
 * post, graphic request or task was created (TPN_2609_006: approved, 7 planned
 * items, 0 posts). */

import {
  noteBriefVersion, forgetBriefVersion, briefVersionOf, adoptBriefVersion,
} from "../src/lib/db/briefVersion";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n    expected ${e}\n         got ${a}`); }
}

const ID = "CAM-2026-7682";
const V0 = "2026-08-03T12:58:37.340Z";
const V1 = "2026-08-03T13:49:01.208Z";
const V2 = "2026-08-03T13:49:02.410Z";

console.log("\nreading a brief remembers the version");
{
  forgetBriefVersion(ID);
  noteBriefVersion(ID, V0);
  is("marker is the version read", briefVersionOf(ID), V0);
  noteBriefVersion(ID, undefined);
  is("a missing version leaves the marker alone", briefVersionOf(ID), V0);
  forgetBriefVersion(ID);
  is("forgetting clears it", briefVersionOf(ID), undefined);
}

console.log("\nour own write moves the marker on");
{
  forgetBriefVersion(ID);
  noteBriefVersion(ID, V0);
  adoptBriefVersion(ID, [{ updated_at: V1 }]);
  is("marker follows the row we just wrote", briefVersionOf(ID), V1);
}

console.log("\napprove → fan-out, the sequence that was failing");
{
  forgetBriefVersion(ID);
  // fetchCampaignBrief inside logBriefApproval
  noteBriefVersion(ID, V0);
  // logBriefApproval's own update: status + approval log, row moves to V1
  adoptBriefVersion(ID, [{ updated_at: V1 }]);
  // saveCampaignBrief → createCampaign upsert, row moves to V2
  adoptBriefVersion(ID, [{ updated_at: V2 }]);
  // persistBriefBlob conditions its update on this
  is("fan-out saves against the current row, not the pre-approval one",
    briefVersionOf(ID), V2);
}

console.log("\na write we cannot read back drops the marker rather than keeping a lie");
{
  forgetBriefVersion(ID);
  noteBriefVersion(ID, V0);
  adoptBriefVersion(ID, []);
  is("empty select clears it", briefVersionOf(ID), undefined);
  noteBriefVersion(ID, V0);
  adoptBriefVersion(ID, null);
  is("null select clears it", briefVersionOf(ID), undefined);
  noteBriefVersion(ID, V0);
  adoptBriefVersion(ID, [{ updated_at: null }]);
  is("a row with no version clears it", briefVersionOf(ID), undefined);
}

console.log("\nsomeone else's write is still a conflict");
{
  forgetBriefVersion(ID);
  noteBriefVersion(ID, V0);
  // nobody adopts anything — the row moved under us, our marker still says V0,
  // so persistBriefBlob's .eq("updated_at", V0) matches nothing. That refusal is
  // the feature; only OUR writes are allowed to move the marker.
  is("marker stays where the read left it", briefVersionOf(ID), V0);
}

console.log("\nmarkers are per campaign");
{
  forgetBriefVersion(ID);
  noteBriefVersion(ID, V0);
  noteBriefVersion("CAM-2026-5945", V1);
  adoptBriefVersion("CAM-2026-5945", [{ updated_at: V2 }]);
  is("the other campaign is untouched", briefVersionOf(ID), V0);
  forgetBriefVersion("CAM-2026-5945");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
