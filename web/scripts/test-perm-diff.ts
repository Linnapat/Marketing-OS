/* Permissions save: what is about to change (Audit 22 Nov 2026, 3.3).
 * Run: node --import tsx scripts/test-perm-diff.ts */
import { permissionChanges, permChangeLabel } from "../src/lib/data/permDiff";

let pass = 0, fail = 0;
const is = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};
const roles = ["CMO", "Co-ordinator"], modules = ["Finance", "Content"];
const before = [["Admin", "Admin"], ["Edit", "View"]];

is("ไม่ได้แก้อะไร = ไม่มีรายการ", permissionChanges(roles, modules, before, before).length, 0);
const one = permissionChanges(roles, modules, before, [["Admin", "Admin"], ["View", "View"]]);
is("แก้หนึ่งช่อง = หนึ่งรายการ", one.length, 1);
is("…บอก role, module, ก่อน, หลัง", [one[0].role, one[0].module, one[0].from, one[0].to], ["Co-ordinator", "Finance", "Edit", "View"]);
is("ลดสิทธิ์ ไม่ถูกติดป้ายกว้างขึ้น", one[0].widens, false);
is("เพิ่มสิทธิ์ ถูกติดป้ายกว้างขึ้น", permissionChanges(roles, modules, before, [["Admin", "Admin"], ["Edit", "Approve"]])[0].widens, true);
is("จาก — เป็น View ก็คือกว้างขึ้น", permissionChanges(["X"], ["Y"], [["—"]], [["View"]])[0].widens, true);
is("คลิกวนครบรอบกลับค่าเดิม = ไม่มีอะไรต้องบันทึก", permissionChanges(roles, modules, before, [["Admin", "Admin"], ["Edit", "View"]]).length, 0);
is("หลายช่องเรียงตามตาราง", permissionChanges(roles, modules, before, [["Approve", "Admin"], ["Edit", "Edit"]]).map(permChangeLabel), ["CMO · Finance", "Co-ordinator · Content"]);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
