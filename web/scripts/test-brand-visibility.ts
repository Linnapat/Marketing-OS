/* Who is allowed to see which brand's rows, derived from a member's free-text
 * `brandAccess` scope ("Teppen · Omakase Don", "All brands", "External only").
 * Getting this wrong leaks one brand's budget into another brand's dashboard, so
 * the tests lean on the confusable pairs. Run: node --import tsx scripts/test-brand-visibility.ts */

import { visibleBrandsFromScope, canSeeAllBrands, isBrandVisible, firstVisibleBrand } from "../src/lib/brandVisibility";
import { BRANDS_DATA, BrandCfg } from "../src/lib/data/settings";
import { BRAND_ORDER, applyBrandOverrides } from "../src/lib/brands";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}
const ALL = [...BRAND_ORDER];

console.log("— ขอบเขตกว้างสุด / แคบสุด —");
is("'All brands' เห็นทุกแบรนด์", visibleBrandsFromScope("All brands"), ALL);
is("ไม่ตั้งค่า (undefined) = เห็นทุกแบรนด์", visibleBrandsFromScope(undefined), ALL);
is("null = เห็นทุกแบรนด์", visibleBrandsFromScope(null), ALL);
is("ค่าว่าง = เห็นทุกแบรนด์", visibleBrandsFromScope("   "), ALL);
is("ไม่สนตัวพิมพ์เล็กใหญ่", visibleBrandsFromScope("all brands"), ALL);
// The agency role is confined to its own portal; it must not resolve to "all".
is("'External only' = ไม่เห็นแบรนด์ใดเลย", visibleBrandsFromScope("External only"), []);
is("'external only' ตัวเล็กก็ต้องปิด", visibleBrandsFromScope("external only"), []);

console.log("\n— ขอบเขตแบรนด์เดียว —");
is("Touka", visibleBrandsFromScope("Touka"), ["touka"]);
is("Mainichi", visibleBrandsFromScope("Mainichi"), ["mainichi"]);
is("Teppen", visibleBrandsFromScope("Teppen"), ["teppen"]);
is("Omakase Don", visibleBrandsFromScope("Omakase Don"), ["omakase"]);

console.log("\n— หลายแบรนด์คั่นด้วย · (รูปแบบที่ USERS_DATA ใช้จริง) —");
is("Teppen · Omakase Don", visibleBrandsFromScope("Teppen · Omakase Don"), ["teppen", "omakase"]);
is("Mainichi · Touka", visibleBrandsFromScope("Mainichi · Touka"), ["mainichi", "touka"]);
is("Teppen · Mainichi", visibleBrandsFromScope("Teppen · Mainichi"), ["teppen", "mainichi"]);
// Order follows the configured brand order, not the order they were typed.
is("ผลลัพธ์เรียงตาม BRAND_ORDER ไม่ใช่ลำดับที่พิมพ์",
  visibleBrandsFromScope("Touka · Teppen"), ["teppen", "touka"]);
is("คั่นด้วย comma ก็ได้", visibleBrandsFromScope("Teppen, Touka"), ["teppen", "touka"]);

console.log("\n— ชื่อพ้อง / ชื่อทางการที่ต่างจากชื่อในระบบ —");
is("'Teppen Thailand' ตัด suffix แล้วยังตรง", visibleBrandsFromScope("Teppen Thailand"), ["teppen"]);
is("alias 'teppenthailand' ติดกัน", visibleBrandsFromScope("teppenthailand"), ["teppen"]);
is("alias 'omakasedon' ติดกัน", visibleBrandsFromScope("omakasedon"), ["omakase"]);
is("ขึ้นต้นด้วย 'Branch ·' ถูกตัดออกก่อนจับคู่",
  visibleBrandsFromScope("Branch · Teppen"), ["teppen"]);

console.log("\n— แบรนด์ที่สะกดคล้ายกันต้องไม่ปนกัน —");
// From memory of a real defect: Takao and Touka are DIFFERENT brands, and a
// loose match once filed Takao's budget under Touka.
is("'Takao' ไม่ใช่ 'Touka' — จับคู่ไม่ได้ จึง fallback เป็นทุกแบรนด์",
  visibleBrandsFromScope("Takao"), ALL);
is("'Touka' ไม่ดึง Teppen มาด้วย", visibleBrandsFromScope("Touka"), ["touka"]);
is("'Mainichi' ไม่ดึง Omakase มาด้วย", visibleBrandsFromScope("Mainichi"), ["mainichi"]);

console.log("\n— ขอบเขตที่อ่านไม่ออก ต้องไม่ทำให้จอว่าง —");
// An unrecognisable scope falls back to every configured brand rather than [],
// so a typo in Settings never blanks someone's dashboard entirely.
is("ข้อความที่ไม่ตรงแบรนด์ใดเลย = fallback ทุกแบรนด์",
  visibleBrandsFromScope("ทีมการตลาดภาคเหนือ"), ALL);
is("ชื่อแบรนด์ที่ถูกลบไปแล้ว = fallback ทุกแบรนด์",
  visibleBrandsFromScope("Sushi Zen"), ALL);

console.log("\n— canSeeAllBrands: สิทธิ์เลือก 'All Brands' บนตัวกรอง —");
is("All brands → true", canSeeAllBrands("All brands"), true);
is("ว่าง → true", canSeeAllBrands(""), true);
is("undefined → true", canSeeAllBrands(undefined), true);
is("แบรนด์เดียว → false", canSeeAllBrands("Touka"), false);
is("สองแบรนด์ → false", canSeeAllBrands("Mainichi · Touka"), false);
// "External only" is not full access; the agency must not get the All Brands chip.
is("External only → false", canSeeAllBrands("External only"), false);

console.log("\n— isBrandVisible: ใช้กรองแถวจริง —");
is("แบรนด์ที่อยู่ในสิทธิ์ → เห็น", isBrandVisible("touka", ["mainichi", "touka"], false), true);
is("แบรนด์นอกสิทธิ์ → ไม่เห็น", isBrandVisible("teppen", ["mainichi", "touka"], false), false);
is("'all' เมื่อมีสิทธิ์ทุกแบรนด์ → เห็น", isBrandVisible("all", ALL, true), true);
is("'all' เมื่อไม่มีสิทธิ์ทุกแบรนด์ → ไม่เห็น", isBrandVisible("all", ["touka"], false), false);
is("สิทธิ์ว่าง (agency) ไม่เห็นอะไรเลย", isBrandVisible("teppen", [], false), false);
is("สิทธิ์ว่าง + allowAll=false → 'all' ก็ไม่เห็น", isBrandVisible("all", [], false), false);

console.log("\n— firstVisibleBrand: แบรนด์ตั้งต้นของตัวกรอง —");
is("หยิบตัวแรกตามสิทธิ์", firstVisibleBrand(["mainichi", "touka"]), "mainichi");
is("แบรนด์เดียวก็หยิบตัวนั้น", firstVisibleBrand(["touka"]), "touka");
is("ไม่มีสิทธิ์เลย → 'all' (ไม่ใช่ undefined)", firstVisibleBrand([]), "all");

console.log("\n— แบรนด์เป็น DATA: ทีมเพิ่ม/ลบแบรนด์เองได้ —");
{
  // Config listing only two brands must not resurrect the other two.
  const trimmed: BrandCfg[] = BRANDS_DATA.filter((b) => b.key === "teppen" || b.key === "touka");
  is("config เหลือสองแบรนด์ → 'All brands' ให้แค่สองแบรนด์",
    visibleBrandsFromScope("All brands", trimmed), ["teppen", "touka"]);
  is("ขอ Mainichi ที่ถูกลบไปแล้ว → fallback เป็นสองแบรนด์ที่เหลือ",
    visibleBrandsFromScope("Mainichi", trimmed), ["teppen", "touka"]);
}
{
  // A renamed brand keeps its id but must match under its NEW name.
  const renamed: BrandCfg[] = BRANDS_DATA.map((b) => (b.key === "touka" ? { ...b, name: "Touka Izakaya" } : b));
  is("แบรนด์ที่เปลี่ยนชื่อ จับคู่ด้วยชื่อใหม่",
    visibleBrandsFromScope("Touka Izakaya", renamed), ["touka"]);
  is("ชื่อใหม่ยังคง id เดิม (touka)", visibleBrandsFromScope("Touka", renamed), ["touka"]);
}
is("config ว่าง → ใช้ค่า seed ทั้งสี่แบรนด์", visibleBrandsFromScope("All brands", []), ALL);

// Kept last: applyBrandOverrides mutates the shared BRANDS registry in place, so
// anything asserting the seed order has to run before this point.
console.log("\n— แบรนด์ที่ทีมเพิ่มเอง (หลัง AppShell เรียก applyBrandOverrides) —");
{
  const added: BrandCfg[] = [
    ...BRANDS_DATA,
    { ...BRANDS_DATA[0], key: "brand-1750000000", name: "Kaisen Ya" },
  ];
  // A scope naming an unregistered brand can't resolve — it is not in BRANDS yet,
  // so it falls back to every seed brand instead of silently showing nothing.
  is("ก่อน register: ชื่อแบรนด์ใหม่ยังจับคู่ไม่ได้ → fallback",
    visibleBrandsFromScope("Kaisen Ya", added), ALL);

  applyBrandOverrides(added); // this is what app start does

  is("หลัง register: จับคู่ด้วยชื่อที่ตั้งไว้ได้",
    visibleBrandsFromScope("Kaisen Ya", added), ["brand-1750000000"]);
  is("'All brands' ครอบแบรนด์ที่เพิ่มใหม่ด้วย",
    visibleBrandsFromScope("All brands", added), [...ALL, "brand-1750000000"]);
  // A brand with no BRAND_ALIASES entry must not throw on the missing key.
  is("แบรนด์ใหม่ไม่มี alias — อ่าน key ที่ไม่มีต้องไม่ระเบิด",
    visibleBrandsFromScope("Teppen · Kaisen Ya", added), ["teppen", "brand-1750000000"]);
  is("แบรนด์ seed ยังทำงานปกติหลังเพิ่มแบรนด์ใหม่",
    visibleBrandsFromScope("Touka", added), ["touka"]);
  is("External only ยังปิดหมดแม้มีแบรนด์ใหม่",
    visibleBrandsFromScope("External only", added), []);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
