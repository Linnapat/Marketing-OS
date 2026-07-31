/* Job numbers for content posts and artwork requests.
 * Run: node --import tsx scripts/test-work-code.ts */

import { nextWorkCode, artworkParent, parseWorkCode } from "../src/lib/data/workCode";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) console.error(`    expected ${e}\n         got ${a}`);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

const CAM = "TPN_2609_003";

console.log("\ncontent numbering, per campaign");
{
  is("first post", nextWorkCode(CAM, "C", []), `${CAM}-C01`);
  is("counts up", nextWorkCode(CAM, "C", [`${CAM}-C01`, `${CAM}-C02`]), `${CAM}-C03`);
  is("another campaign's posts don't count",
    nextWorkCode(CAM, "C", ["OMD_2609_001-C09", `${CAM}-C01`]), `${CAM}-C02`);
  is("pads to two digits, then grows", nextWorkCode(CAM, "C", [`${CAM}-C99`]), `${CAM}-C100`);
}

console.log("\nartwork hangs off its post");
{
  const post = `${CAM}-C01`;
  is("first artwork for a post", nextWorkCode(post, "A", []), `${post}-A01`);
  is("second artwork for the same post",
    nextWorkCode(post, "A", [`${post}-A01`]), `${post}-A02`);
  is("a sibling post's artwork doesn't count",
    nextWorkCode(post, "A", [`${CAM}-C02-A01`, `${CAM}-C02-A02`]), `${post}-A01`);
  // The one that would break if the prefix check were sloppy: C-numbering must
  // not see "…-C01-A01" as a C-child of the campaign.
  is("nested artwork is not counted as a post",
    nextWorkCode(CAM, "C", [`${CAM}-C01`, `${CAM}-C01-A01`, `${CAM}-C01-A02`]), `${CAM}-C02`);
}

console.log("\nartwork with no post falls back to the campaign");
{
  is("parent is the post when there is one", artworkParent(`${CAM}-C01`, CAM), `${CAM}-C01`);
  is("parent is the campaign when there isn't", artworkParent(undefined, CAM), CAM);
  is("no parent at all is refused, not guessed", artworkParent(undefined, undefined), undefined);
  is("standalone artwork numbers under the campaign",
    nextWorkCode(CAM, "A", [`${CAM}-A01`]), `${CAM}-A02`);
  is("a post's artwork doesn't consume a standalone number",
    nextWorkCode(CAM, "A", [`${CAM}-C01-A01`]), `${CAM}-A01`);
}

console.log("\nnumbers are not reused");
{
  // Deleting C02 leaves a gap on purpose — reissuing it would point an already
  // written-down reference at different work.
  is("gap after a deletion stays a gap",
    nextWorkCode(CAM, "C", [`${CAM}-C01`, `${CAM}-C03`]), `${CAM}-C04`);
}

console.log("\ncross-campaign links are not nested");
{
  // Live data has a request in campaign A pointing at a post that has since
  // moved to campaign B. Nesting there would give the artwork a code naming a
  // campaign it is not in — the caller passes no post code in that case.
  is("no post code means the campaign is the parent", artworkParent(undefined, CAM), CAM);
  is("a post code from the same campaign wins", artworkParent(`${CAM}-C01`, CAM), `${CAM}-C01`);
}

console.log("\nparsing");
{
  is("campaign only", parseWorkCode(CAM), { campaign: CAM });
  is("content", parseWorkCode(`${CAM}-C01`), { campaign: CAM, content: "01" });
  is("artwork under content", parseWorkCode(`${CAM}-C01-A02`), { campaign: CAM, content: "01", artwork: "02" });
  is("artwork under campaign", parseWorkCode(`${CAM}-A02`), { campaign: CAM, artwork: "02" });
  is("not one of ours", parseWorkCode("ci-3"), null);
  is("old campaign format is not one of ours", parseWorkCode("TPN-2026-003"), null);
  is("junk", parseWorkCode(""), null);
}

console.log("\nContent ID column derives from the request's own code");
{
  // The Graphic list shows which POST a request is for, read off the request's
  // own job number rather than fetched — the number already contains it.
  const contentIdOf = (code?: string) => {
    const n = parseWorkCode(code ?? "")?.content;
    return n ? `C${n}` : "";
  };
  is("artwork attached to a post", contentIdOf(`${CAM}-C04-A01`), "C04");
  is("standalone artwork has no post", contentIdOf(`${CAM}-A01`), "");
  is("uncoded request says nothing rather than guessing", contentIdOf(undefined), "");
  is("a ci-N left over from before is not mistaken for a post", contentIdOf("ci-3"), "");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
