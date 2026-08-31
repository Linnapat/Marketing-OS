/* Runtime tests for assertDbOk — the layer that turns a Postgres error into
 * words a marketer can act on.
 *
 * The bug it exists for: "เพิ่ม Graphic Request แล้วขึ้นว่าบันทึกไม่ได้" on
 * OMD_2609_006-A01. The request HAD been saved; a second click one second later
 * hit the unique index and came back 23505, and the raw message was shown as a
 * save failure. Telling someone their work was lost when it was not is worse
 * than saying nothing, so the duplicate case gets its own words.
 * Run with:  npm test */

import { assertDbOk } from "../src/lib/db/assert";

let pass = 0, fail = 0;
function has(name: string, actual: string, needle: string) {
  if (actual.includes(needle)) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); console.error(`    "${needle}" not in "${actual}"`); }
}
function messageOf(error: { message?: string; code?: string }): string {
  try { assertDbOk(error, "บันทึกไม่สำเร็จ"); } catch (e) { return e instanceof Error ? e.message : String(e); }
  return "";
}

console.log("\n— กดซ้ำระหว่างที่ยังบันทึกอยู่ —");
const dupe = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "graphic_requests_blob_id_uniq"',
};
has("บอกว่าบันทึกไปแล้ว ไม่ใช่บันทึกไม่ได้", messageOf(dupe), "ถูกบันทึกไปแล้ว");
has("บอกวิธีเช็คต่อ", messageOf(dupe), "refresh");
// PostgREST บางเส้นทางส่ง message มาโดยไม่มี code
has("ไม่มี code ก็ยังจับได้จากข้อความ", messageOf({ message: 'duplicate key value violates unique constraint "tasks_blob_id_uniq"' }), "ถูกบันทึกไปแล้ว");

console.log("\n— เคสอื่นต้องไม่โดนกลืน —");
has("RLS ยังบอกเรื่องสิทธิ์", messageOf({ code: "42501", message: "new row violates row-level security policy" }), "ไม่มีสิทธิ์");
has("อักขระที่เก็บไม่ได้ยังบอกเรื่องการวาง", messageOf({ code: "22P05", message: "unsupported Unicode escape sequence" }), "อักขระที่มองไม่เห็น");
has("error อื่นส่งข้อความเดิมต่อ", messageOf({ code: "08006", message: "connection failure" }), "connection failure");

console.log("\n— ไม่มี error ต้องไม่ throw —");
{
  let threw = false;
  try { assertDbOk(null, "บันทึกไม่สำเร็จ"); } catch { threw = true; }
  if (!threw) { pass++; console.log("  ✓ error = null ผ่านฉลุย"); }
  else { fail++; console.error("  ✗ FAIL: error = null ไม่ควร throw"); }
}

console.log(`\n${fail ? "✗" : "✓"} db errors: ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
