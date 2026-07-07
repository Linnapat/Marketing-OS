/* Runtime tests for the KOL + Content flow logic (pure functions).
 * Run with:  npx tsx --tsconfig tsconfig.json scripts/test-flows.ts
 * No test runner is configured; this is a self-contained assert harness. */

import { Kol, KOLS } from "../src/lib/data/kol";
import {
  canTransition, prerequisitesFor, canSaveResults, nextStage, hasOwner, hasPostLink,
} from "../src/lib/kolFlow";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

// A minimal KOL fixture at a given stage; override any field.
const base = (over: Partial<Kol>): Kol => ({ ...(KOLS[0] as Kol), posts: [], postLink: null, ...over });

console.log("KOL flow — guarded transitions");
{
  const k = base({ status: "Request", owner: "Unassigned" });
  check("Request→Owner Assigned blocked when no owner", !canTransition(k, "Owner Assigned").ok);
  check("Request→Owner Assigned ok once owner set", canTransition(base({ status: "Request", owner: "Nok W." }), "Owner Assigned").ok);
  check("Request→Negotiating blocked (skips a stage)", !canTransition(base({ status: "Request", owner: "Nok W." }), "Negotiating").ok);
}
{
  const k = base({ status: "Negotiating", contractStatus: "Pending", quotationStatus: "Pending" });
  check("Negotiating→Contract Signed blocked without contract+quotation", !canTransition(k, "Contract Signed").ok);
  const ok = base({ status: "Negotiating", contractStatus: "Signed", quotationStatus: "Approved" });
  check("Negotiating→Contract Signed ok with both", canTransition(ok, "Contract Signed").ok);
}
{
  const noLink = base({ status: "Producing", postLink: null, posts: [] });
  check("Producing→In Review blocked without draft link", !canTransition(noLink, "In Review").ok);
  const withLink = base({ status: "Producing", posts: [{ platform: "Instagram", link: "https://x" }] });
  check("Producing→In Review ok with a post link", canTransition(withLink, "In Review").ok);
}
{
  const notApproved = base({ status: "Approved", posts: [{ platform: "Instagram", link: "https://x" }] });
  check("Approved→Posted ok (approval passed + link)", canTransition(notApproved, "Posted").ok);
  const noLink = base({ status: "Approved", posts: [] });
  check("Approved→Posted blocked without final link", !canTransition(noLink, "Posted").ok);
}
{
  check("Backward move (revision) always allowed", canTransition(base({ status: "In Review" }), "Producing").ok);
}

console.log("KOL — results gating");
{
  check("Save Results blocked before Posted", !canSaveResults(base({ status: "In Review", posts: [{ platform: "Instagram", link: "x" }] })).ok);
  check("Save Results ok when Posted + link", canSaveResults(base({ status: "Posted", posts: [{ platform: "Instagram", link: "x" }] })).ok);
  check("Save Results blocked when Posted but no link", !canSaveResults(base({ status: "Posted", posts: [] })).ok);
}

console.log("KOL — helpers");
{
  check("hasOwner false for Unassigned", !hasOwner(base({ owner: "Unassigned" })));
  check("hasPostLink true from posts[]", hasPostLink(base({ posts: [{ platform: "Instagram", link: "y" }] })));
  check("nextStage(Request) = Owner Assigned", nextStage(base({ status: "Request" })) === "Owner Assigned");
  check("nextStage(Completed) = null", nextStage(base({ status: "Completed" })) === null);
  check("prereq In Review lists link when missing", prerequisitesFor("In Review", base({ posts: [] })).length === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
