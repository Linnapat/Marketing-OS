/* Asset link previews/downloads + the New Post combobox filter. */

import assert from "node:assert/strict";
import { assetLinkView, driveFileId, heroPreview, isDirectImage } from "../src/lib/data/assetLinks";
import { comboboxMatches } from "../src/lib/data/optionSearch";

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

console.log("✓ asset links + combobox filter");
