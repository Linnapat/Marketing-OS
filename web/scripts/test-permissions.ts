/* Module-level access: the Settings → Permissions matrix, and which matrix module
 * guards each route. Nav rendering and page gates both read from here, so a wrong
 * answer either hides a page from someone who needs it or opens Finance to the
 * whole team. Run: node --import tsx scripts/test-permissions.ts */

import { defaultMatrix, permLevel, canSeeModule, moduleForPath, PERM_NONE, APP_ROLE_TO_PERM_ROLE, PermMatrix } from "../src/lib/permissions";
import { PERM_MODULES, PERM_ROLES } from "../src/lib/data/settings";
import type { Role } from "../src/lib/role";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}
const r = (x: string) => x as Role;

console.log("— defaultMatrix สร้างจาก PERM_ROLES ครบทุกช่อง —");
{
  const m = defaultMatrix();
  is("มีทุก role ที่ประกาศไว้", Object.keys(m).length, PERM_ROLES.length);
  is("แต่ละ role มีครบทุก module", PERM_ROLES.every((role) => PERM_MODULES.every((mod) => m[role.role][mod] !== undefined)), true);
  // The perms array is positional against PERM_MODULES — a length mismatch would
  // silently shift every level one column over (KOL rights landing on Finance).
  is("จำนวน perms ต่อ role เท่ากับจำนวน module (ไม่เลื่อนคอลัมน์)",
    PERM_ROLES.every((role) => role.perms.length === PERM_MODULES.length), true);
  is("CMO เป็น Admin ทุก module", PERM_MODULES.every((mod) => m["CMO"][mod] === "Admin"), true);
  is("คอลัมน์ที่ 4 คือ Finance", PERM_MODULES[3], "Finance");
  is("Marketing Manager ได้ View ที่ Finance (ไม่ใช่ Approve)", m["Marketing Manager / BGL"]["Finance"], "View");
  is("Marketing Manager ได้ Approve ที่ Campaign", m["Marketing Manager / BGL"]["Campaign"], "Approve");
  is("มีแต่ CMO ที่แตะ Settings ได้",
    PERM_ROLES.filter((role) => m[role.role]["Settings"] !== PERM_NONE).map((role) => role.role), ["CMO"]);
}

console.log("\n— permLevel: อ่านค่าจาก matrix ที่บันทึกไว้ —");
{
  is("CMO / Campaign = Admin", permLevel(null, r("CMO"), "Campaign"), "Admin");
  is("Marketing Executive / Campaign = Edit", permLevel(null, r("Marketing Executive"), "Campaign"), "Edit");
  is("KOL Specialist / KOL = Edit", permLevel(null, r("KOL Specialist"), "KOL"), "Edit");
  is("KOL Specialist / Finance = —", permLevel(null, r("KOL Specialist"), "Finance"), PERM_NONE);
  is("Agency / Campaign = —", permLevel(null, r("Agency (External)"), "Campaign"), PERM_NONE);
  is("Agency / Graphic = Edit (ทำงานที่ได้รับมอบหมาย)", permLevel(null, r("Agency (External)"), "Graphic"), "Edit");
}

console.log("\n— matrix ที่ admin บันทึก ต้องชนะค่า default —");
{
  const saved: PermMatrix = { "Co-ordinator": { Finance: "Edit" }, CMO: { Settings: PERM_NONE } };
  is("ยกระดับ Co-ordinator → Finance = Edit", permLevel(saved, r("Co-ordinator"), "Finance"), "Edit");
  // Only the overridden cell changes; the rest still comes from the defaults.
  is("ช่องอื่นของ role เดิมยังใช้ค่า default", permLevel(saved, r("Co-ordinator"), "Campaign"), "View");
  is("admin ปิด Settings ของตัวเองได้ (ไม่มี hardcode ยกเว้น CMO)",
    permLevel(saved, r("CMO"), "Settings"), PERM_NONE);
  is("role ที่ matrix ที่บันทึกไม่ได้เอ่ยถึง ยังใช้ค่า default",
    permLevel(saved, r("KOL Specialist"), "KOL"), "Edit");
}

console.log("\n— ค่าที่อ่านไม่ได้ ต้องปิดประตู (fail closed) —");
{
  // A role added in Supabase that the bundled matrix has never heard of must not
  // inherit anything — an unknown role with Edit rights is a privilege escalation.
  is("role ที่ไม่รู้จัก / Finance = —", permLevel(null, r("Junior Motion Graphic"), "Finance"), PERM_NONE);
  is("role ที่ไม่รู้จัก / Campaign = —", permLevel(null, r("Junior Motion Graphic"), "Campaign"), PERM_NONE);
  is("module ที่ไม่รู้จัก = —", permLevel(null, r("CMO"), "Payroll"), PERM_NONE);
  is("role ว่าง = —", permLevel(null, r(""), "Campaign"), PERM_NONE);
  const partial: PermMatrix = { CMO: {} };
  is("matrix ที่บันทึกไม่มีช่องนั้น → ตกไปใช้ default ไม่ใช่ undefined",
    permLevel(partial, r("CMO"), "Campaign"), "Admin");
}

console.log("\n— canSeeModule: ระดับใดก็ได้ที่ไม่ใช่ — ถือว่าเห็น —");
{
  is("Admin เห็น", canSeeModule(null, r("CMO"), "Finance"), true);
  is("Approve เห็น", canSeeModule(null, r("Marketing Manager / BGL"), "Campaign"), true);
  is("Edit เห็น", canSeeModule(null, r("Marketing Executive"), "Content"), true);
  // View is read-only but still visible — the nav item must render.
  is("View ก็ยังเห็น (อ่านได้)", canSeeModule(null, r("Marketing Manager / BGL"), "Finance"), true);
  is("— ไม่เห็น", canSeeModule(null, r("KOL Specialist"), "Finance"), false);
  is("role ที่ไม่รู้จักไม่เห็นอะไรเลย", canSeeModule(null, r("Junior Motion Graphic"), "Content"), false);
}

console.log("\n— moduleForPath: route ไหนถูกคุมด้วย module ไหน —");
{
  is("/campaigns → Campaign", moduleForPath("/campaigns"), "Campaign");
  is("/content → Content", moduleForPath("/content"), "Content");
  is("/graphic → Graphic", moduleForPath("/graphic"), "Graphic");
  is("/kol → KOL", moduleForPath("/kol"), "KOL");
  is("/finance → Finance", moduleForPath("/finance"), "Finance");
  is("/settings → Settings", moduleForPath("/settings"), "Settings");

  console.log("  · หน้าที่แชร์ module กับหน้าอื่น");
  is("/performance-center คุมด้วย Campaign", moduleForPath("/performance-center"), "Campaign");
  is("/platforms คุมด้วย Campaign", moduleForPath("/platforms"), "Campaign");
  is("/requests คุมด้วย Campaign", moduleForPath("/requests"), "Campaign");
  is("/approvals คุมด้วย Campaign", moduleForPath("/approvals"), "Campaign");
  is("/ads คุมด้วย Campaign", moduleForPath("/ads"), "Campaign");
  is("/assets คุมด้วย Graphic", moduleForPath("/assets"), "Graphic");
  is("/expenses คุมด้วย Finance (เงินอยู่ใต้ Finance)", moduleForPath("/expenses"), "Finance");
  is("/admin คุมด้วย Settings", moduleForPath("/admin"), "Settings");

  console.log("  · เส้นทางลูกต้องสืบสิทธิ์จากพ่อ");
  is("/campaigns/CMP-001 → Campaign", moduleForPath("/campaigns/CMP-001"), "Campaign");
  is("/campaigns/new → Campaign", moduleForPath("/campaigns/new"), "Campaign");
  is("/campaigns/omd-store → Campaign", moduleForPath("/campaigns/omd-store"), "Campaign");
  is("/performance-center/creative-kpi → Campaign", moduleForPath("/performance-center/creative-kpi"), "Campaign");
  is("/finance/pnl → Finance", moduleForPath("/finance/pnl"), "Finance");

  console.log("  · หน้าที่เปิดให้ทุก role ภายใน");
  is("/ (Dashboard) ไม่ถูกคุม", moduleForPath("/"), null);
  is("/my-tasks ไม่ถูกคุม", moduleForPath("/my-tasks"), null);
  is("/team ไม่ถูกคุม", moduleForPath("/team"), null);
  is("/workflow ไม่ถูกคุม", moduleForPath("/workflow"), null);
  is("/agency ไม่ถูกคุมด้วย matrix (กั้นด้วย role แยก)", moduleForPath("/agency"), null);
  is("/login ไม่ถูกคุม", moduleForPath("/login"), null);

  console.log("  · การจับคู่ prefix ต้องไม่หลวม");
  // A prefix match on the bare string would let /settings-export through as
  // Settings — or worse, match an unrelated route that merely starts the same.
  is("/campaignsomething ไม่ใช่ /campaigns", moduleForPath("/campaignsomething"), null);
  is("/settings-export ไม่ใช่ /settings", moduleForPath("/settings-export"), null);
  is("/kolx ไม่ใช่ /kol", moduleForPath("/kolx"), null);
  is("/financeperformance ไม่ใช่ /finance", moduleForPath("/financeperformance"), null);
}

console.log("\n— APP_ROLE_TO_PERM_ROLE ต้องครบทุก role ที่แอปใช้ —");
{
  // Every role in the app vocabulary needs a matrix counterpart, or that role
  // silently falls through to PERM_NONE everywhere and sees an empty app.
  const appRoles = Object.keys(APP_ROLE_TO_PERM_ROLE);
  const matrixRoles = PERM_ROLES.map((x) => x.role);
  is("ทุก role มีคู่ใน matrix", appRoles.filter((x) => !matrixRoles.includes(APP_ROLE_TO_PERM_ROLE[r(x)])), []);
  is("ไม่มี role ใน matrix ที่แอปไม่รู้จัก", matrixRoles.filter((x) => !appRoles.includes(x)), []);
  is("จำนวน role ตรงกันสองฝั่ง", appRoles.length, matrixRoles.length);
  is("ทุก role มองเห็นอย่างน้อยหนึ่ง module",
    appRoles.filter((role) => !PERM_MODULES.some((mod) => canSeeModule(null, r(role), mod))), []);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
