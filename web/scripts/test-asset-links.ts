/* Asset link previews/downloads + the New Post combobox filter. */

import assert from "node:assert/strict";
import { assetLinkView, driveFileId, heroPreview, isDirectImage } from "../src/lib/data/assetLinks";
import { comboboxMatches } from "../src/lib/data/optionSearch";
import { assetPreviewSrc, isFolderLink, dropboxImageSrc } from "../src/lib/data/requests";
import { attachApprovedAssets, applyCaptionDecision, readyToQueue, type ContentItem } from "../src/lib/data/content";

const DRIVE_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456";

// --- Drive file ids, in every shape Drive hands out -------------------------
assert.equal(driveFileId(`https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`), DRIVE_ID);
assert.equal(driveFileId(`https://drive.google.com/open?id=${DRIVE_ID}`), DRIVE_ID);
assert.equal(driveFileId(`https://drive.google.com/uc?export=download&id=${DRIVE_ID}`), DRIVE_ID);
// Folders hold many files: no single thumbnail, nothing to download.
assert.equal(driveFileId(`https://drive.google.com/drive/folders/${DRIVE_ID}`), null);
assert.equal(driveFileId(`https://drive.google.com/drive/u/0/folders/${DRIVE_ID}`), null);
assert.equal(driveFileId("https://figma.com/file/abc/Wagyu"), null);
assert.equal(driveFileId(""), null);

// --- Direct images ----------------------------------------------------------
assert.equal(isDirectImage("https://cdn.example.com/a/wagyu-1x1.PNG"), true);
assert.equal(isDirectImage("https://cdn.example.com/a/wagyu.jpg?v=2"), true);
assert.equal(isDirectImage("https://www.canva.com/design/abc/view"), false);
assert.equal(isDirectImage("wagyu.png"), false); // not a URL — never rendered

// --- The view a row renders from -------------------------------------------
const drive = assetLinkView(`https://drive.google.com/file/d/${DRIVE_ID}/view`);
assert.equal(drive.previewUrl, `https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w1000`);
assert.equal(drive.downloadUrl, `https://drive.google.com/uc?export=download&id=${DRIVE_ID}`);

const png = assetLinkView("https://cdn.example.com/assets/wagyu%20reel.png");
assert.equal(png.previewUrl, "https://cdn.example.com/assets/wagyu%20reel.png");
assert.equal(png.downloadUrl, "https://cdn.example.com/assets/wagyu%20reel.png");
assert.equal(png.fileName, "wagyu reel.png", "filename is decoded for the download attribute");

// A Canva/Figma page can be opened but neither previewed nor downloaded — the
// row must not offer a Download button that lands on an HTML page.
const canva = assetLinkView("https://www.canva.com/design/abc/view");
assert.equal(canva.previewUrl, null);
assert.equal(canva.downloadUrl, null);

// Junk in the link field must not blow up the drawer.
for (const bad of ["", "   ", "not a url", "javascript:alert(1)"]) {
  const v = assetLinkView(bad);
  assert.equal(v.previewUrl, null);
  assert.equal(v.downloadUrl, null);
}

// --- Hero preview -----------------------------------------------------------
// The first *previewable* asset wins, not merely the first asset.
const hero = heroPreview([
  { link: "https://www.canva.com/design/abc/view" },
  { link: "https://cdn.example.com/a/two.jpg" },
]);
assert.equal(hero?.previewUrl, "https://cdn.example.com/a/two.jpg");
assert.equal(hero?.href, "https://cdn.example.com/a/two.jpg");

// No graphic request, but Creative pasted a Drive link on the schedule.
assert.equal(
  heroPreview([], `https://drive.google.com/file/d/${DRIVE_ID}/view`)?.previewUrl,
  `https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w1000`,
);
assert.equal(heroPreview(undefined, undefined), null);
assert.equal(heroPreview([{ link: "https://www.canva.com/design/abc/view" }]), null);

// --- Combobox filtering -----------------------------------------------------
const campaigns = ["Wagyu Festival 2026", "Rainy Season Promo", "LINE Coupon Drive", "Father's Day Set"];
assert.deepEqual(comboboxMatches(campaigns, ""), campaigns, "empty query shows everything");
assert.deepEqual(comboboxMatches(campaigns, "  "), campaigns);
// Substring, not prefix — the datalist this replaced only matched from the start.
assert.deepEqual(comboboxMatches(campaigns, "season"), ["Rainy Season Promo"]);
assert.deepEqual(comboboxMatches(campaigns, "WAGYU"), ["Wagyu Festival 2026"], "case-insensitive");
// Every term must hit, in any order.
assert.deepEqual(comboboxMatches(campaigns, "fest wagyu"), ["Wagyu Festival 2026"]);
assert.deepEqual(comboboxMatches(campaigns, "wagyu rainy"), []);
assert.deepEqual(comboboxMatches(campaigns, "zzz"), []);

// --- Asset Library thumbnails -----------------------------------------------
// Live data: three of the four assets are Dropbox photo FOLDERS, which is why
// no preview ever appeared. A folder has no thumbnail; the card must say so
// rather than render an <img> that can only 404.
const DB_FOLDER = "https://www.dropbox.com/scl/fo/zegx6buu4mkno9njsihd5/AJfKA53Er?rlkey=3kc1wjwpf5nl17jy0o0bcudsa&st=yxviwf8k&dl=0";
const DB_FILE = "https://www.dropbox.com/scl/fi/abc123def456/photo.jpg?rlkey=abc123rlkey&st=xyz&dl=0";
const DB_OLD_FILE = "https://www.dropbox.com/s/abc123def456/photo.jpg?dl=0";
const DB_HOME = "https://www.dropbox.com/home/MKT%20Team/AW?quickview=id%3Abcu";

assert.equal(isFolderLink(DB_FOLDER), true);
assert.equal(isFolderLink("https://www.dropbox.com/sh/abc123def456/AAA"), true);
assert.equal(isFolderLink(DB_FILE), false);
assert.equal(isFolderLink(`https://drive.google.com/drive/folders/${DRIVE_ID}`), true);
assert.equal(isFolderLink(`https://drive.google.com/file/d/${DRIVE_ID}/view`), false);

// rlkey is what makes a /scl/ link readable — dropping the query (as the old
// one-liner did) turns a working link into a 403.
assert.ok(dropboxImageSrc(DB_FILE).includes("rlkey=abc123rlkey"));
assert.ok(dropboxImageSrc(DB_FILE).includes("raw=1"));
assert.ok(!dropboxImageSrc(DB_FILE).includes("dl=0"));
assert.equal(dropboxImageSrc(DB_FOLDER), "");
assert.equal(dropboxImageSrc("https://example.com/a.png"), "");
assert.ok(dropboxImageSrc(DB_OLD_FILE).includes("raw=1"));

// assetPreviewSrc end to end
assert.equal(assetPreviewSrc({ driveUrl: DB_FOLDER }), "");
assert.ok(assetPreviewSrc({ driveUrl: DB_FILE }).includes("raw=1"));
assert.equal(assetPreviewSrc({ driveUrl: `https://drive.google.com/drive/folders/${DRIVE_ID}` }), "");
assert.ok(assetPreviewSrc({ driveUrl: `https://drive.google.com/file/d/${DRIVE_ID}/view` }).includes("thumbnail?id="));
assert.equal(assetPreviewSrc({ driveUrl: "https://cdn.example/a.png" }), "https://cdn.example/a.png");
assert.equal(assetPreviewSrc({ driveUrl: "#" }), "");
// An explicit thumbnail still has to be an image: the one asset that had a
// previewUrl held a /home/ viewer path, and the card rendered it broken.
assert.equal(assetPreviewSrc({ previewUrl: DB_HOME, driveUrl: DB_HOME }), "");
assert.equal(assetPreviewSrc({ previewUrl: DB_FOLDER, driveUrl: DB_FILE }).includes("raw=1"), true);
assert.equal(assetPreviewSrc({ previewUrl: "https://cdn.example/x.jpg", driveUrl: DB_FOLDER }), "https://cdn.example/x.jpg");

// --- อาร์ตเวิร์กอนุมัติแล้ว โพสต์ต้องเข้าคิวรอ publish ----------------------
// เดิมเซ็ตแค่ assetStatus โดย publishStatus ค้างเป็น "Draft" — 17 โพสต์ที่งาน
// อนุมัติครบแล้วจึงไปกองรวมกับโพสต์ที่ยังไม่มีใครเริ่ม แยกไม่ออกจนกว่าจะเปิดดูทีละใบ
const post = (over: Partial<ContentItem> = {}): ContentItem => ({
  id: "c1", day: 5, time: "10:00", title: "Reel", b: "teppen", plat: "Instagram",
  status: "Waiting Design", campaign: "Brand Awareness", owner: "Gik", caption: "", hashtags: "", cta: "",
  captionStatus: "Missing", assetStatus: "Waiting Design", approvalStatus: "Draft", publishStatus: "Draft",
  ...over,
} as ContentItem);
const oneAsset = [{ platform: "Instagram", size: "9:16 (1080×1920)", link: "https://dropbox/reel.mp4" }];

// ต้องครบสองด้าน: แคปชั่นอนุมัติ + อาร์ตเวิร์กอนุมัติ
const approvedCaption = { captionStatus: "Approved" };
assert.equal(attachApprovedAssets(post(approvedCaption), oneAsset).publishStatus, "Queued");
assert.equal(attachApprovedAssets(post(approvedCaption), oneAsset).assetStatus, "Approved");
// แคปชั่นยังไม่อนุมัติ = ยังไม่พร้อมลง แม้อาร์ตเวิร์กจะเสร็จ
assert.equal(attachApprovedAssets(post({ captionStatus: "Ready" }), oneAsset).publishStatus, "Draft");
assert.equal(attachApprovedAssets(post({ captionStatus: "Missing" }), oneAsset).publishStatus, "Draft");
// โพสต์ที่ลงไปแล้วต้องไม่ถูกดึงกลับมาเข้าคิว
assert.equal(attachApprovedAssets(post({ ...approvedCaption, publishStatus: "Published" }), oneAsset).publishStatus, "Published");
// ไม่มีไฟล์แนบ = ยังไม่มีอะไรให้รอ publish
assert.equal(attachApprovedAssets(post(approvedCaption), []).publishStatus, "Draft");
assert.equal(attachApprovedAssets(post(approvedCaption), [{ platform: "IG", size: "1:1", link: "" }]).publishStatus, "Draft");
// อยู่ในคิวอยู่แล้ว ส่งไฟล์เวอร์ชันใหม่เข้าไม่เปลี่ยนอะไร
assert.equal(attachApprovedAssets(post({ ...approvedCaption, publishStatus: "Queued" }), oneAsset).publishStatus, "Queued");

// อีกทางหนึ่ง: อาร์ตเวิร์กเสร็จก่อน แล้วแคปชั่นมาอนุมัติทีหลัง
const artworkDone = post({ assetStatus: "Approved", captionStatus: "Ready" });
assert.equal(applyCaptionDecision(artworkDone, "approve", "Pupay").publishStatus, "Queued");
// "Final" คือคำเดิมของ "อนุมัติแล้ว" ที่ยังมีในแถวเก่า — ต้องนับด้วย
assert.equal(applyCaptionDecision(post({ assetStatus: "Final", captionStatus: "Ready" }), "approve", "Pupay").publishStatus, "Queued");
// อาร์ตเวิร์กยังไม่เสร็จ อนุมัติแคปชั่นอย่างเดียวยังไม่เข้าคิว
assert.equal(applyCaptionDecision(post({ assetStatus: "Waiting Design", captionStatus: "Ready" }), "approve", "Pupay").publishStatus, "Draft");
// คนที่ย้ายกลับเป็น Draft เองต้องไม่ถูกดันกลับเข้าคิว — withPublishQueue ทำงาน
// เฉพาะจังหวะที่ลายเซ็นเพิ่งลง ไม่ใช่ทุกครั้งที่บันทึก
assert.equal(readyToQueue({ captionStatus: "Approved", assetStatus: "Approved" }), true);
assert.equal(readyToQueue({ captionStatus: "Ready", assetStatus: "Approved" }), false);
assert.equal(readyToQueue({ captionStatus: "Approved", assetStatus: "No Asset" }), false);

console.log("✓ asset links + combobox filter + asset thumbnails + queued-for-publish");
