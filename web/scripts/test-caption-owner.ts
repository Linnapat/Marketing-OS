/* Who owns writing a post's caption.
 * Run: node --import tsx scripts/test-caption-owner.ts
 *
 * The bug this guards (reported 12 Aug 2026, OMD_2609_005-C02): the drawer's
 * "Owner (คนเขียนแคปชั่น)" read "ยังไม่มอบหมาย" on a post whose content planner
 * had been recorded since the campaign was approved. 40 of the 60 live posts
 * were in that state (Pupay 24, Gik 16) — all of them created before the
 * fan-out started stamping the planner as owner.
 *
 * It was never only a label. Everything that routes caption work reads the
 * owner, so those 40 jobs were in nobody's My Tasks, counted against nobody's
 * workload, and sat on the Status Board under "ยังไม่มีเจ้าของ". */

import { captionOwner, realName, ContentItem } from "../src/lib/data/content";
import { contentItems, groupByOwner, NO_OWNER } from "../src/lib/data/statusBoard";
import { teamFromDb } from "../src/lib/data/derive";
import type { Member } from "../src/lib/db/settings";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n    expected ${e}\n         got ${a}`); }
}

const post = (over: Partial<ContentItem> = {}): ContentItem => ({
  id: `p${Math.random().toString(36).slice(2)}`, day: 5, time: "10:00", title: "Order Now, Pick Up Later",
  b: "omakase", plat: "Facebook", status: "Planned", campaign: "Delivery and Takeaway",
  owner: "Unassigned", caption: "", hashtags: "", cta: "",
  captionStatus: "Missing", assetStatus: "Waiting Design", approvalStatus: "Draft", publishStatus: "Draft",
  ...over,
} as ContentItem);

const member = (name: string, role = "Marketing Manager / BGL"): Member =>
  ({ name, email: `${name.toLowerCase()}@teppenthailand.co.th`, role, access: "Editor",
     brandAccess: "All brands", status: "Active", color: "#000" }) as Member;

console.log("\nthe planner owns the caption until somebody takes it");
{
  is("an assigned writer is the owner", captionOwner({ owner: "Saii", requester: "Pupay" }), "Saii");
  is("nobody assigned → the content planner", captionOwner({ owner: "Unassigned", requester: "Pupay" }), "Pupay");
  is("blank owner reads the same as Unassigned", captionOwner({ owner: "", requester: "Pupay" }), "Pupay");
  is("whitespace is not a name", captionOwner({ owner: "   ", requester: "Gik" }), "Gik");
  is("case doesn't rescue the placeholder", captionOwner({ owner: "unassigned", requester: "Gik" }), "Gik");
  is("no planner either → empty, for the caller to phrase", captionOwner({ owner: "Unassigned", requester: "" }), "");
  is("a planner recorded as Unassigned is nobody", captionOwner({ owner: "Unassigned", requester: "Unassigned" }), "");
  is("the owner's own name is trimmed", captionOwner({ owner: " Saii ", requester: "Pupay" }), "Saii");
}

console.log("\n\"Unassigned\" is a placeholder, not a person");
{
  is("a real name survives", realName("Pupay"), "Pupay");
  is("the placeholder does not", realName("Unassigned"), "");
  is("neither does nothing at all", realName(undefined), "");
}

console.log("\nworkload counts the post against its planner");
{
  const pupay = member("Pupay");
  const t = teamFromDb([pupay], [], [], [], [post({ requester: "Pupay" }), post({ requester: "Pupay" })]);
  is("both posts land on the planner", t.members.find((m) => m.name === "Pupay")?.openPosts, 2);
  is("and no orphan row is invented", t.members.some((m) => m.name === "Unassigned"), false);

  // A post with nobody at all is still nobody's — it must stay visible as its
  // own row rather than being quietly attributed to a real person.
  const none = teamFromDb([pupay], [], [], [], [post({ requester: "" })]);
  is("a post with no planner stays in the Unassigned row",
    none.members.find((m) => m.name === "Unassigned")?.openPosts, 1);
  is("…and is not pushed onto a real member", none.members.find((m) => m.name === "Pupay")?.openPosts, 0);
}

console.log("\nthe Status Board names the planner instead of nobody");
{
  const [item] = contentItems([post({ requester: "Gik", dateIso: "2026-09-14" })]);
  is("the work item carries the planner", item.owner, "Gik");
  const loads = groupByOwner([item]);
  is("so it groups under a person", loads.map((l) => l.owner), ["Gik"]);

  const [orphan] = contentItems([post({ requester: "" })]);
  is("with genuinely nobody, the board still says so", groupByOwner([orphan]).map((l) => l.owner), [NO_OWNER]);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
