/* One link box on a content item, and what happens to the three that went.
 *
 * The form asked for Reference Brief Link, Reference Image Link, Google Drive
 * Link and Competitor / Inspiration Link — and fed all four into the SINGLE
 * link the Graphic Request carries, Drive first. So the labels promised four
 * different things and delivered one: a competitor link typed on a campaign was
 * handed to the designer as the brief.
 *
 * Now only Reference Brief Link can be typed. The dangerous part is precedence:
 * with Drive still winning, a legacy driveLink would outrank the link someone
 * just typed in the only box they have, and the form would show one URL while
 * the designer opened another. Run with: npm test */

import { contentBriefLink, emptyContentItem } from "../src/lib/data/brief";
import { briefFromSheet } from "../src/lib/data/briefSheet";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

const BRIEF = "https://docs.google.com/presentation/d/brief";
const DRIVE = "https://drive.google.com/drive/folders/xyz";
const IMAGE = "https://example.com/image.jpg";
const RIVAL = "https://instagram.com/p/rival";

console.log("— contentBriefLink(): ช่องที่พิมพ์ได้ต้องชนะเสมอ —");
is("มีแค่ brief", contentBriefLink({ referenceBriefLink: BRIEF }), BRIEF);
// นี่คือกับดักตัวจริง: ของเก่ามี driveLink ค้างอยู่ คนพิมพ์ช่องใหม่แล้วต้องได้ของใหม่
is("brief ชนะ drive ที่ค้างจากของเก่า", contentBriefLink({ referenceBriefLink: BRIEF, driveLink: DRIVE }), BRIEF);
is("brief ชนะทุกช่องรวมกัน", contentBriefLink({ referenceBriefLink: BRIEF, driveLink: DRIVE, referenceImageLink: IMAGE, competitorLink: RIVAL }), BRIEF);

console.log("\n— แถวเก่าที่ไม่มี brief ต้องยังอ่านลิงก์ได้ ไม่หาย —");
is("เหลือแค่ drive (11 แถวจริงเป็นแบบนี้)", contentBriefLink({ referenceBriefLink: "", driveLink: DRIVE }), DRIVE);
is("เหลือแค่ image", contentBriefLink({ referenceBriefLink: "", referenceImageLink: IMAGE }), IMAGE);
is("เหลือแค่ competitor", contentBriefLink({ referenceBriefLink: "", competitorLink: RIVAL }), RIVAL);
is("drive มาก่อน image", contentBriefLink({ referenceBriefLink: "", driveLink: DRIVE, referenceImageLink: IMAGE }), DRIVE);
is("ไม่มีลิงก์เลย = ค่าว่าง", contentBriefLink({ referenceBriefLink: "" }), "");
is("ช่องว่างล้วนไม่นับเป็นลิงก์", contentBriefLink({ referenceBriefLink: "   ", driveLink: DRIVE }), DRIVE);
is("undefined ทั้งหมดก็ไม่พัง", contentBriefLink({ referenceBriefLink: "" }), "");
is("ตัดช่องว่างหัวท้าย", contentBriefLink({ referenceBriefLink: `  ${BRIEF}  ` }), BRIEF);
is("emptyContentItem ไม่มีลิงก์", contentBriefLink(emptyContentItem(1)), "");

console.log("\n— import จากชีต: 4 คอลัมน์ ลงช่องเดียว —");
// briefFromSheet is the public door; readContent is private, and a test is not
// a reason to widen a module's surface.
const OVERVIEW = [["Field", "Value"], ["Campaign Name", "ทดสอบลิงก์"], ["Brand", "Teppen"]];
const resolveBrand = () => "teppen" as const;
const sheet = (over: Record<string, string> = {}) => {
  // Header labels must match the template EXACTLY — columns() compares
  // normalised equality, not "contains", so "Content Title" matches nothing.
  const headers = ["Title", "Type", "Reference Brief Link", "Reference Image Link", "Google Drive Link", "Competitor / Inspiration Link"];
  const row = ["โพสต์ทดสอบ", "Photo", over.brief ?? "", over.image ?? "", over.drive ?? "", over.rival ?? ""];
  return briefFromSheet({ overview: OVERVIEW, content: [headers, row], kol: [], budget: [] }, resolveBrand).patch.content ?? [];
};
is("คอลัมน์ brief ลง referenceBriefLink", sheet({ brief: BRIEF })[0]?.referenceBriefLink, BRIEF);
// ชีตที่กรอกแค่ช่อง Drive เคยทำให้ลิงก์ไปนอนอยู่ในช่องที่ฟอร์มไม่แสดงแล้ว
is("ชีตกรอกแค่ Drive ก็ต้องโผล่ในช่องที่เห็น", sheet({ drive: DRIVE })[0]?.referenceBriefLink, DRIVE);
is("ชีตกรอกแค่ competitor", sheet({ rival: RIVAL })[0]?.referenceBriefLink, RIVAL);
is("ชีตกรอกหลายช่อง เอา brief ก่อน", sheet({ brief: BRIEF, drive: DRIVE, rival: RIVAL })[0]?.referenceBriefLink, BRIEF);
is("ไม่กรอกเลย = ว่าง", sheet()[0]?.referenceBriefLink, "");
// ช่องที่เลิกใช้ต้องไม่ถูกเขียนกลับเข้าไปอีก ไม่งั้นก็กลับไปมีสี่แหล่งเหมือนเดิม
is("ไม่เขียนช่องที่เลิกใช้กลับเข้าไป", [sheet({ drive: DRIVE })[0]?.driveLink, sheet({ rival: RIVAL })[0]?.competitorLink], [undefined, undefined]);

console.log(`\n${fail === 0 ? "✅" : "❌"} content-brief-link: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
