/* fetchAllRows — read a whole table, not the first 1,000 rows of it.
 * My Tasks lost every task past row 1,000 (Jungjing: 17 jobs) because
 * PostgREST caps a response and says nothing. Run with: npm test */

import { fetchAllRows } from "../src/lib/db/fetchAll";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

async function main() {
  const table = Array.from({ length: 2345 }, (_, i) => ({ id: i + 1 }));
  const calls: [number, number][] = [];
  const all = await fetchAllRows((from, to) => {
    calls.push([from, to]);
    // PostgREST returns at most 1,000 rows no matter what was asked for.
    return Promise.resolve({ data: table.slice(from, Math.min(to + 1, from + 1000)), error: null });
  });
  check("ได้ครบทุกแถว", all.data?.length === 2345 && all.data?.[2344].id === 2345);
  check("อ่าน 3 หน้าแล้วหยุด", calls.length === 3);
  const exact = await fetchAllRows((from) => Promise.resolve({ data: from === 0 ? table.slice(0, 1000) : [], error: null }));
  check("พอดี 1,000 แถว ก็ครบ", exact.data?.length === 1000);
  const err = await fetchAllRows(() => Promise.resolve({ data: null, error: { message: "boom" } }));
  check("error ส่งต่อ ไม่คืนข้อมูลครึ่ง ๆ", err.data === null && err.error?.message === "boom");
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
