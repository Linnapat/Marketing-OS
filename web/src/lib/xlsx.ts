// Minimal .xlsx writer — enough to hand a grid of cells to Excel, no dependency.
//
// The team asked to export the Work Calendar as a real spreadsheet. CSV loses
// the sheet name and makes Excel guess at encoding and column types; a true
// .xlsx is a ZIP of five small XML parts, so we build that directly rather than
// pulling in a ~1MB spreadsheet library for one button.
//
// Everything is STORED (no compression). These sheets are a few hundred cells,
// so the size difference is irrelevant and it keeps the writer to a CRC and two
// record layouts.

const enc = new TextEncoder();

/** CRC-32 (IEEE 802.3), the checksum ZIP entries carry. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

interface ZipEntry { name: string; bytes: Uint8Array; crc: number; offset: number }

/** Store-only ZIP. Returns the archive bytes. */
function zip(files: { name: string; content: string }[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const entries: ZipEntry[] = [];
  let offset = 0;

  const push = (b: Uint8Array) => { chunks.push(b); offset += b.length; };
  // DOS date/time: ZIP has no "unset" value, so pin every entry to 1980-01-01.
  // A real clock would make the same export produce different bytes each run.
  const dosTime = 0, dosDate = 33; // 1980-01-01

  const localHeader = (name: Uint8Array, crc: number, size: number) => {
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0, true);
    h.setUint16(8, 0, true); // stored
    h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true);
    h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    return new Uint8Array(h.buffer);
  };

  for (const f of files) {
    const name = enc.encode(f.name);
    const bytes = enc.encode(f.content);
    const crc = crc32(bytes);
    entries.push({ name: f.name, bytes, crc, offset });
    push(localHeader(name, crc, bytes.length));
    push(name);
    push(bytes);
  }

  const cdStart = offset;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const h = new DataView(new ArrayBuffer(46));
    h.setUint32(0, 0x02014b50, true); h.setUint16(4, 20, true); h.setUint16(6, 20, true);
    h.setUint16(8, 0, true); h.setUint16(10, 0, true);
    h.setUint16(12, dosTime, true); h.setUint16(14, dosDate, true);
    h.setUint32(16, e.crc, true); h.setUint32(20, e.bytes.length, true); h.setUint32(24, e.bytes.length, true);
    h.setUint16(28, name.length, true); h.setUint16(30, 0, true); h.setUint16(32, 0, true);
    h.setUint16(34, 0, true); h.setUint16(36, 0, true); h.setUint32(38, 0, true);
    h.setUint32(42, e.offset, true);
    push(new Uint8Array(h.buffer));
    push(name);
  }

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, offset - cdStart, true); end.setUint32(16, cdStart, true);
  push(new Uint8Array(end.buffer));

  const out = new Uint8Array(offset);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** XML text escape. Also drops control characters, which XML 1.0 forbids
 *  outright — one stray \x0B in a pasted task name makes Excel call the whole
 *  file corrupt rather than skipping the cell. */
function xmlEscape(s: string): string {
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** A1-style column name: 1 → A, 27 → AA. */
export function colName(n: number): string {
  let s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; }
  return s;
}

/** Excel caps sheet names at 31 chars and forbids : \ / ? * [ ] */
function safeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, "-").trim();
  return (cleaned || "Sheet1").slice(0, 31);
}

export type Cell = string | number | null | undefined;

/** Build an .xlsx from a rectangular grid. Numbers are written as numbers so
 *  Excel can sum them; everything else goes in as an inline string. */
export function sheetToXlsx(rows: Cell[][], sheetName = "Sheet1"): Uint8Array {
  const body = rows.map((row, r) => {
    const cells = row.map((v, c) => {
      if (v === null || v === undefined || v === "") return "";
      const ref = `${colName(c + 1)}${r + 1}`;
      if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(v))}</t></is></c>`;
    }).join("");
    return `<row r="${r + 1}">${cells}</row>`;
  }).join("");

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetData>${body}</sheetData></worksheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"`
    + ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheets><sheet name="${xmlEscape(safeSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  return zip([
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
        + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
        + `<Default Extension="xml" ContentType="application/xml"/>`
        + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
        + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        + `</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
        + `</Relationships>`,
    },
    { name: "xl/workbook.xml", content: workbook },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`
        + `</Relationships>`,
    },
    { name: "xl/worksheets/sheet1.xml", content: sheet },
  ]);
}

/** Browser-side save. Kept here so callers never re-implement the anchor dance. */
export function downloadXlsx(rows: Cell[][], filename: string, sheetName = "Sheet1"): void {
  const bytes = sheetToXlsx(rows, sheetName);
  // Copy into a fresh ArrayBuffer: Blob rejects a SharedArrayBuffer-backed view,
  // and slicing keeps this independent of how the caller allocated.
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
