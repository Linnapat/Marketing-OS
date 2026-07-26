/* Saved caption building blocks (hashtag sets / CTAs / footers). These now live
 * in a team-shared store rather than one browser's localStorage, so a bug here
 * corrupts the library for everyone rather than for one person.
 * Run: node --import tsx scripts/test-caption-templates.ts */

import {
  MAX_TEMPLATES,
  CaptionTemplateStore,
  emptyTemplates,
  forgetTemplate,
  normalizeList,
  parseStore,
  rememberTemplate,
  templatesFor,
} from "../src/lib/data/captionTemplates";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

console.log("— normalizeList: ตัดช่องว่าง / กันซ้ำ / จำกัดจำนวน —");
is("ตัดช่องว่างหัวท้าย", normalizeList(["  #wagyu  "]), ["#wagyu"]);
is("ทิ้งค่าว่างและช่องว่างล้วน", normalizeList(["", "   ", "#a"]), ["#a"]);
is("กันซ้ำ เก็บตัวแรกไว้", normalizeList(["#a", "#a", "#b"]), ["#a", "#b"]);
is("ซ้ำแบบมีช่องว่างต่างกันก็ถือว่าซ้ำ", normalizeList(["#a", "  #a  "]), ["#a"]);
is("เรียงตามลำดับที่ส่งเข้ามา", normalizeList(["#b", "#a"]), ["#b", "#a"]);
is(
  `จำกัดที่ ${MAX_TEMPLATES} ชุด`,
  normalizeList(Array.from({ length: 20 }, (_, i) => `#t${i}`)).length,
  MAX_TEMPLATES,
);
is(
  "เกินโควตาแล้วตัดตัวท้ายทิ้ง ไม่ใช่ตัวหน้า",
  normalizeList(Array.from({ length: 20 }, (_, i) => `#t${i}`))[0],
  "#t0",
);

console.log("\n— templatesFor: แบรนด์ที่ยังไม่มีข้อมูล —");
is("แบรนด์ที่ไม่เคยบันทึก คืนลิสต์ว่าง ไม่ใช่ undefined", templatesFor({}, "teppen"), emptyTemplates());
is(
  "payload ที่ขาดบางช่อง ยังคืนครบสามช่อง",
  templatesFor({ teppen: { hashtags: ["#a"] } } as unknown as CaptionTemplateStore, "teppen"),
  { hashtags: ["#a"], ctas: [], footers: [] },
);
{
  // The picker maps over these arrays; handing back the stored reference would
  // let a caller mutate the store in place.
  const store: CaptionTemplateStore = { teppen: { hashtags: ["#a"], ctas: [], footers: [] } };
  const got = templatesFor(store, "teppen");
  got.hashtags.push("#injected");
  is("คืนสำเนา แก้ผลลัพธ์แล้วไม่กระทบ store เดิม", store.teppen.hashtags, ["#a"]);
}

console.log("\n— rememberTemplate: บันทึกชุดใหม่ —");
{
  const s1 = rememberTemplate({}, "teppen", "hashtags", "#wagyu #bangkok");
  is("บันทึกลงแบรนด์ที่ระบุ", templatesFor(s1, "teppen").hashtags, ["#wagyu #bangkok"]);
  is("แบรนด์อื่นไม่ถูกแตะ", templatesFor(s1, "mainichi").hashtags, []);

  const s2 = rememberTemplate(s1, "mainichi", "hashtags", "#matcha");
  is("แบรนด์ที่สองแยกกันจริง — teppen", templatesFor(s2, "teppen").hashtags, ["#wagyu #bangkok"]);
  is("แบรนด์ที่สองแยกกันจริง — mainichi", templatesFor(s2, "mainichi").hashtags, ["#matcha"]);

  const s3 = rememberTemplate(s2, "teppen", "footers", "สาขาสีลม · 10:00-22:00");
  is("คนละช่องในแบรนด์เดียวกันไม่ปนกัน — footers", templatesFor(s3, "teppen").footers, ["สาขาสีลม · 10:00-22:00"]);
  is("คนละช่องในแบรนด์เดียวกันไม่ปนกัน — hashtags ยังอยู่", templatesFor(s3, "teppen").hashtags, ["#wagyu #bangkok"]);

  is("ชุดใหม่ไปอยู่หน้าสุด", templatesFor(rememberTemplate(s3, "teppen", "hashtags", "#new"), "teppen").hashtags, ["#new", "#wagyu #bangkok"]);
}
{
  // Re-saving an existing entry should surface it, not duplicate it — otherwise
  // the 12-slot cap fills with copies of the same set.
  const s = rememberTemplate(rememberTemplate(rememberTemplate({}, "teppen", "ctas", "A"), "teppen", "ctas", "B"), "teppen", "ctas", "A");
  is("บันทึกซ้ำของเดิม ไม่เพิ่มรายการ", templatesFor(s, "teppen").ctas.length, 2);
  is("บันทึกซ้ำของเดิม ดันขึ้นหน้าสุด", templatesFor(s, "teppen").ctas, ["A", "B"]);
}
is("ค่าว่างไม่ถูกบันทึก", templatesFor(rememberTemplate({}, "teppen", "hashtags", "   "), "teppen").hashtags, []);
{
  const before: CaptionTemplateStore = { teppen: { hashtags: ["#a"], ctas: [], footers: [] } };
  rememberTemplate(before, "teppen", "hashtags", "#b");
  is("ไม่แก้ store เดิม (immutable)", before.teppen.hashtags, ["#a"]);
}

console.log("\n— forgetTemplate: ลบชุดที่ไม่ใช้ —");
{
  const s = rememberTemplate(rememberTemplate({}, "teppen", "hashtags", "#keep"), "teppen", "hashtags", "#typo");
  is("ลบตัวที่ระบุออก", templatesFor(forgetTemplate(s, "teppen", "hashtags", "#typo"), "teppen").hashtags, ["#keep"]);
  is("ลบค่าที่ไม่มีอยู่ ไม่พังและไม่เปลี่ยนอะไร", templatesFor(forgetTemplate(s, "teppen", "hashtags", "#ghost"), "teppen").hashtags, ["#typo", "#keep"]);
  is("ลบจากแบรนด์ที่ไม่มีข้อมูล ไม่พัง", templatesFor(forgetTemplate(s, "touka", "hashtags", "#x"), "touka").hashtags, []);
  is("ลบแล้วช่องอื่นไม่หาย", templatesFor(forgetTemplate(rememberTemplate(s, "teppen", "ctas", "CTA"), "teppen", "hashtags", "#typo"), "teppen").ctas, ["CTA"]);
}

console.log("\n— parseStore: ข้อมูลที่อ่านมาจาก storage —");
is("null → store ว่าง", parseStore(null), {});
is("array → store ว่าง (ไม่ใช่รูปแบบที่ถูก)", parseStore([1, 2]), {});
is("string → store ว่าง", parseStore("nope"), {});
is(
  "payload ปกติผ่านครบ",
  parseStore({ teppen: { hashtags: ["#a"], ctas: ["c"], footers: ["f"] } }),
  { teppen: { hashtags: ["#a"], ctas: ["c"], footers: ["f"] } },
);
is(
  "ช่องที่หายไปถูกเติมเป็นลิสต์ว่าง",
  parseStore({ teppen: { hashtags: ["#a"] } }),
  { teppen: { hashtags: ["#a"], ctas: [], footers: [] } },
);
is(
  "ค่าที่ไม่ใช่ string ถูกคัดทิ้ง",
  parseStore({ teppen: { hashtags: ["#a", 5, null, { x: 1 }] } }).teppen.hashtags,
  ["#a"],
);
is("แบรนด์ที่ค่าไม่ใช่ object ถูกข้าม", parseStore({ teppen: "junk", mainichi: { ctas: ["c"] } }), { mainichi: { hashtags: [], ctas: ["c"], footers: [] } });
is(
  "payload ที่เกินโควตาถูกตัดตอนอ่าน",
  parseStore({ teppen: { hashtags: Array.from({ length: 30 }, (_, i) => `#t${i}`) } }).teppen.hashtags.length,
  MAX_TEMPLATES,
);
is("ค่าซ้ำใน payload ถูกยุบตอนอ่าน", parseStore({ teppen: { hashtags: ["#a", "#a"] } }).teppen.hashtags, ["#a"]);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
