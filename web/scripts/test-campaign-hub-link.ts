/* Which records belong to which campaign.
 *
 * The hub matched on the campaign NAME, and names are not unique. Two live
 * campaigns are both called "Brand Awareness" — Teppen and Omakase Don, same
 * owner. Opening the Teppen one listed the Omakase one's 7 posts and 7 graphic
 * requests: another brand's work, on her campaign, with nothing to say so.
 *
 * It hid the way out too. The Teppen campaign is approved with nothing ever
 * created, and the "สร้างงานจากแผนนี้" button only appears when the hub reports
 * zero content — the seven leaked rows made it look finished, so the one
 * control that would have built her plan never rendered.
 *
 * Run with: npm test */

import { belongsToCampaign } from "../src/lib/db/campaignHub";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

const TEPPEN = { id: "CAM-2026-7682", name: "Brand Awareness", nameIsUnique: false };
const OMD = { id: "CAM-2026-1303", name: "Brand Awareness", nameIsUnique: false };
const SOLO = { id: "CAM-2026-4770", name: "Seasonal menu", nameIsUnique: true };

console.log("— id คือคำตอบ ไม่ว่าชื่อจะตรงหรือไม่ —");
is("แถวที่มี id ของเรา = ของเรา", belongsToCampaign({ campaignId: "CAM-2026-7682", campaign: "Brand Awareness" }, TEPPEN), true);
// เคสจริงที่รั่ว: โพสต์ของ OMD ชื่อแคมเปญเหมือนกันเป๊ะ แต่ id คนละตัว
is("แถวของแคมเปญอื่นที่ชื่อซ้ำ = ไม่ใช่ของเรา", belongsToCampaign({ campaignId: "CAM-2026-1303", campaign: "Brand Awareness" }, TEPPEN), false);
is("และมองจากอีกฝั่งก็ต้องไม่รั่วกลับ", belongsToCampaign({ campaignId: "CAM-2026-7682", campaign: "Brand Awareness" }, OMD), false);
is("id ตรงแต่ชื่อเพี้ยน (เปลี่ยนชื่อแคมเปญ) ยังเป็นของเรา", belongsToCampaign({ campaignId: "CAM-2026-7682", campaign: "ชื่อเก่า" }, TEPPEN), true);

console.log("\n— แถวเก่าที่ยังไม่มี id —");
is("ชื่อไม่ซ้ำ = เชื่อชื่อได้", belongsToCampaign({ campaign: "Seasonal menu" }, SOLO), true);
is("ชื่อไม่ซ้ำ แต่คนละชื่อ", belongsToCampaign({ campaign: "อย่างอื่น" }, SOLO), false);
// จุดตัดสินใจ: เดาไม่ได้ก็ไม่เดา — แสดงน้อยไปยังเห็นและแก้ได้
// แต่เอางานของแบรนด์อื่นมาแปะว่าเป็นของเรา มองไม่เห็นและแก้ไม่ถูก
is("ชื่อซ้ำ = ไม่เดา ตัดทิ้ง", belongsToCampaign({ campaign: "Brand Awareness" }, TEPPEN), false);
is("ไม่มีทั้ง id และชื่อ", belongsToCampaign({}, SOLO), false);

console.log("\n— ค่าว่างต้องไม่กลายเป็นคู่ที่แมตช์กัน —");
is("id ว่างเปล่าไม่นับว่ามี id", belongsToCampaign({ campaignId: "   ", campaign: "Seasonal menu" }, SOLO), true);
is("แคมเปญไม่มีชื่อ + แถวไม่มีชื่อ ต้องไม่แมตช์", belongsToCampaign({ campaign: "" }, { id: "X", name: "", nameIsUnique: true }), false);

console.log(`\n${fail === 0 ? "✅" : "❌"} campaign-hub-link: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
