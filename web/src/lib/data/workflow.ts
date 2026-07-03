// Work Calendar — ported from the team's "JULY 2026 ( Work Flow )" sheet.
// A monthly timeline that reminds each team of their recurring deliverables.
// Day markers below are transcribed from the source sheet; the number shown in
// a cell is the sheet's own marker value (e.g. "7", "6", "8-9"). Edit freely.

export const MONTH_LABEL = "July 2026";

// Weekday letter per day-of-month (1..31), matching the sheet's header row.
export const WEEKDAYS = [
  "W", "TH", "F", "S", "S", "M", "T", "W", "TH", "F", // 1-10
  "S", "S", "M", "T", "W", "TH", "F", "S", "S", "M",  // 11-20
  "T", "W", "TH", "F", "S", "S", "M", "T", "W", "TH", // 21-30
  "F",                                                 // 31
];
export const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
export const isWeekend = (day: number) => WEEKDAYS[day - 1] === "S";

export interface WorkTask {
  en: string;
  jp: string;
  r: string;                       // Responsible (担当者 / ผู้รับผิดชอบ)
  a: string;                       // Accountable
  link?: string;
  note?: string;
  qty?: string;                    // e.g. "8 clip"
  marks: Record<number, string>;   // day-of-month → marker value
}

export interface WorkSection {
  key: string;
  label: string;
  accent: string;   // text / border accent
  bg: string;       // light row / chip background
  tasks: WorkTask[];
}

export const WORK_SECTIONS: WorkSection[] = [
  {
    key: "report", label: "Report", accent: "#4E7A4E", bg: "#EEF4EE",
    tasks: [
      { en: "CRM Line HBD for Teppen", jp: "CRMライン誕生日", r: "CRM (automation/manual)", a: "MKT", marks: { 1: "7" } },
      { en: "CRM Performance Report", jp: "CRM実績レポート", r: "CRM", a: "MKT", marks: { 3: "6" } },
      { en: "CRM Reservation Report to MKT", jp: "予約実績レポート (MKT向け)", r: "CRM", a: "MKT", marks: { 3: "6" } },
      { en: "CRM Admin Chat Response Table", jp: "チャット対応実績", r: "CRM", a: "MKT", marks: { 3: "6" } },
      { en: "KOL Confirm to branch", jp: "KOL連携確認", r: "KOL", a: "MKT", marks: { 1: "7" } },
      { en: "Delivery Report", jp: "配送実績レポート", r: "BGL", a: "MKT", marks: { 9: "6" } },
      { en: "TO Report", jp: "TO実績レポート", r: "BGL", a: "MKT", marks: { 9: "6" } },
      { en: "OMD Report", jp: "OMD実績レポート", r: "BGL", a: "MKT", marks: { 9: "6" } },
      { en: "CRM Report", jp: "CRM総合レポート", r: "CRM", a: "MKT", marks: { 9: "6" } },
      { en: "KOL Report", jp: "KOL実績レポート", r: "KOL", a: "MKT", marks: { 9: "6" } },
      { en: "Creative Report", jp: "制作実績レポート", r: "CR", a: "MKT", marks: { 9: "6" } },
      { en: "P&L", jp: "損益 (P/L)", r: "BGL", a: "MKT", link: "MKT expense-PL", marks: { 10: "6" } },
    ],
  },
  {
    key: "mkt", label: "MKT", accent: "#C68A1E", bg: "#FBF3E2",
    tasks: [
      { en: "Proposal & Feedback Next 2 months Campaign Plan ( Ads, Budget, Goal ) by e-mail", jp: "提案・フィードバック・次の2ヶ月施策計画 (広告・予算・目標) メール送付", r: "BGL > CMO", a: "CMO", link: "TO Campaign / OMD Campaign", marks: { 1: "9" } },
      { en: "Confirm Next 2 Months Campaign Plan by e-mail", jp: "次の2ヶ月施策計画確認", r: "CMO", a: "CMO", link: "Promotion Proposal", marks: { 2: "9" } },
      { en: "KOL request submit by e-mail", jp: "KOL依頼メール送付", r: "BGL", a: "KOL", link: "KOL request", marks: { 8: "8-9" } },
      { en: "Calendar Content / KOL Plan (List KOL)", jp: "コンテンツカレンダー／KOL施策計画 (KOLリスト)", r: "CP/KOL", a: "CR/BGL", link: "TO Content / OMD Content / KOL Plan", marks: { 8: "8-9" } },
      { en: "Campaign Brief ( AW : POP / Ads )", jp: "キャンペーンブリーフ (AW: POP / 広告)", r: "BGL > CR", a: "CR", marks: { 1: "9", 2: "9", 3: "9", 6: "9", 7: "9", 8: "9", 9: "9", 10: "9" } },
    ],
  },
  {
    key: "pos", label: "POS / OPS", accent: "#8E5AA8", bg: "#F2EAF7",
    tasks: [
      { en: "Confirm Menu Price / Product details.", jp: "メニュー価格・商品確認", r: "OPS > MKT", a: "BGL", marks: { 10: "8-9" } },
      { en: "Request POS Promotion by e-mail", jp: "POSプロモーション依頼メール送付", r: "BGL > OPS", a: "BGL", marks: { 13: "8-9", 14: "8-9", 17: "8-9" } },
      { en: "แจ้ง Promotion หน้าร้าน + ส่ง Offline AW (POP) หน้าร้าน", jp: "店舗プロモーション案内+オフラインAW(POP)送付", r: "BGL > NiNew", a: "BGL", marks: { 24: "8" } },
      { en: "หน้าร้าน Recheck POS + Offline AW", jp: "店舗POS・オフラインAW再確認", r: "BGL > Cast", a: "BGL", note: "Need template*", marks: { 24: "8" } },
      { en: "Work Flow Schedule", jp: "ワークフロースケジュール", r: "Admin (Coor) > MKT", a: "BGL", marks: { 24: "8" } },
    ],
  },
  {
    key: "meeting", label: "Meeting", accent: "#2E7D74", bg: "#E5F2F0",
    tasks: [
      { en: "Management Seminar (14:00-16:00)", jp: "マネジメントセミナー", r: "BGL / CR", a: "—", marks: { 21: "7" } },
    ],
  },
  {
    key: "creative", label: "Creative", accent: "#B5487A", bg: "#FAE9F1",
    tasks: [
      { en: "ส่ง Content Post Plan + Caption ทางอีเมล (Reply MKT campaign)", jp: "コンテンツ投稿計画+キャプション メール送付 (MKTキャンペーン返信)", r: "CP", a: "BGL/CR", marks: { 13: "9" } },
      { en: "Present VDO story board (MKT final caption for post)", jp: "動画ストーリーボード提案 (投稿用最終キャプション)", r: "CP", a: "BGL/CR", marks: { 16: "9" } },
      { en: "แจ้งตารางถ่ายกับหน้าร้าน", jp: "撮影スケジュール店舗連絡", r: "CP", a: "CR", marks: { 20: "9" } },
      { en: "AW revise", jp: "AW修正", r: "Creator", a: "BGL", marks: { 14: "9", 15: "9", 16: "9", 17: "9", 20: "9", 21: "9", 22: "9", 23: "9", 24: "9" } },
      { en: "Final AW", jp: "AW最終版", r: "Creator", a: "BGL", marks: { 23: "9" } },
      { en: "Shooting Must Eat / POP for next 2 month", jp: "撮影 (Must Eat / 次の2ヶ月POP)", r: "CP", a: "CR", note: "ถ่ายแล้ว 26/6", marks: {} },
      { en: "VDO shooting Takaojapanesefood", jp: "動画撮影 (Takao Japanese Food)", r: "Creator", a: "CEO", qty: "8 clip", marks: { 1: "7", 16: "7", 17: "7", 22: "7", 29: "7", 31: "7" } },
      { en: "VDO shooting MS", jp: "動画撮影 (MS)", r: "Creator / CP", a: "CR", qty: "3+3 clip", marks: { 16: "8", 17: "8" } },
      { en: "VDO shooting TO", jp: "動画撮影 (TO)", r: "Creator / CP", a: "CR", qty: "20+3 clip", marks: { 1: "8", 3: "8", 16: "8", 17: "8" } },
      { en: "VDO shooting OMD", jp: "動画撮影 (OMD)", r: "Creator / CP", a: "CR", qty: "20+3 clip", marks: { 2: "7", 10: "8", 11: "8", 22: "8", 30: "8" } },
      { en: "Branding VDO final", jp: "ブランド動画最終版", r: "CR", a: "CMO", marks: { 24: "8" } },
      { en: "Setting branding video by month", jp: "ブランド動画月次運用設定", r: "CP", a: "CR", marks: { 27: "8", 28: "8", 29: "8", 30: "8", 31: "8" } },
      { en: "Trendy VDO final by week", jp: "トレンド動画最終版 (週次)", r: "CR", a: "CMO", marks: { 1: "7", 7: "7", 14: "7", 21: "7", 28: "7" } },
      { en: "Setting trendy video by week", jp: "トレンド動画週次運用設定", r: "CP", a: "CR", marks: { 1: "7", 7: "7", 14: "7", 21: "7", 28: "7" } },
      { en: "Setting Artwork for Ads", jp: "広告アートワーク設定", r: "BGL", a: "—", marks: { 29: "8", 30: "8", 31: "8" } },
    ],
  },
  {
    key: "weekly", label: "Weekly update", accent: "#3E5C9A", bg: "#EAEFF8",
    tasks: [
      { en: "Weekly Team Lead ( 10:00-12:00 ) - KOL meeting ( 12:00-12:30 )", jp: "週次チームリードミーティング・KOLミーティング", r: "CMO / BGL / CR / KOL", a: "MKT", note: "PK & CTPK", marks: { 13: "8-9", 30: "7" } },
      { en: "Pupay with Saii weekly (10.00-11.00)", jp: "Pupay・Sai週次ミーティング", r: "Pupay / BGL / Admin (Coor)", a: "MKT", marks: { 6: "7", 13: "7", 20: "7", 27: "7", 31: "7" } },
      { en: "Pupay with Ninew task list update (11.00-12.00)", jp: "Pupay・Ninewタスク進捗共有ミーティング", r: "BGL / KOL", a: "MKT", marks: { 6: "7", 13: "7", 20: "7", 27: "7", 31: "7" } },
      { en: "Pupay with K.Gik", jp: "Pupay・K.Gikミーティング", r: "BGL / CMO", a: "MKT", marks: { 13: "7", 27: "7" } },
      { en: "Peach with K.Gik weekly (Wed. 16:00-17:00)", jp: "Peach・K.Gik週次ミーティング", r: "CR / CMO", a: "CR", marks: { 1: "7", 8: "7", 15: "7", 22: "7", 29: "7" } },
      { en: "Peach with Creative team weekly (Mon. 11:00-11:30)", jp: "Peach・クリエイティブチーム週次ミーティング", r: "CR / CP / Creator", a: "CR", marks: { 6: "7", 13: "7", 20: "7", 27: "7" } },
      { en: "Peach with Creative team monthly mendan (Mon. 13:00-15:00)", jp: "Peach・クリエイティブチーム月次面談", r: "CR / CP / Creator", a: "CR", marks: { 6: "6" } },
    ],
  },
];

export const ALL_WORK_TASKS = WORK_SECTIONS.flatMap((s) =>
  s.tasks.map((t) => ({ ...t, section: s })),
);

/* ── Auto-generation across any month ──────────────────────────────────
 * The source sheet's day markers ARE July 2026 (July 1 2026 = Wednesday, which
 * matches the real calendar). So we treat July 2026 as the template and project
 * each marker onto a target month by its "weekday + occurrence" slot — e.g. a
 * marker on the 2nd Friday stays on the 2nd Friday of whatever month is chosen.
 * Weekly/recurring tasks therefore re-flow onto the right days automatically,
 * and selecting July 2026 reproduces the original sheet exactly. */

export const TEMPLATE_YEAR = 2026;
export const TEMPLATE_MONTH = 6; // July, 0-based

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const LETTER = ["S", "M", "T", "W", "TH", "F", "S"]; // getDay() 0..6 → sheet letters

export interface MonthMeta { year: number; month: number; days: number[]; letters: string[]; }

export function monthMeta(year: number, month: number): MonthMeta {
  const count = new Date(year, month + 1, 0).getDate();
  const days: number[] = [];
  const letters: string[] = [];
  for (let d = 1; d <= count; d++) {
    days.push(d);
    letters.push(LETTER[new Date(year, month, d).getDay()]);
  }
  return { year, month, days, letters };
}

export const isWeekendDate = (year: number, month: number, day: number) => {
  const wd = new Date(year, month, day).getDay();
  return wd === 0 || wd === 6;
};

// Which weekday, and which occurrence of it within the month, a given day is.
function slotOf(year: number, month: number, day: number) {
  const wd = new Date(year, month, day).getDay();
  let occ = 0;
  for (let d = 1; d <= day; d++) if (new Date(year, month, d).getDay() === wd) occ++;
  return { wd, occ };
}

// The day-of-month that is the `occ`-th `wd` weekday of the target month (or null).
function dayForSlot(year: number, month: number, wd: number, occ: number): number | null {
  const count = new Date(year, month + 1, 0).getDate();
  let seen = 0;
  for (let d = 1; d <= count; d++) {
    if (new Date(year, month, d).getDay() === wd) {
      seen++;
      if (seen === occ) return d;
    }
  }
  return null;
}

/** Project template (July 2026) markers onto the target month. */
export function projectMarks(base: Record<number, string>, year: number, month: number): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [dayStr, val] of Object.entries(base)) {
    const { wd, occ } = slotOf(TEMPLATE_YEAR, TEMPLATE_MONTH, Number(dayStr));
    const td = dayForSlot(year, month, wd, occ);
    if (td) out[td] = val;
  }
  return out;
}

// Marker values an admin can cycle a cell through while editing.
export const VALUE_CYCLE = ["7", "8", "9", "6", "8-9"];
export function nextValue(current: string | undefined): string {
  if (!current) return VALUE_CYCLE[0];
  const i = VALUE_CYCLE.indexOf(current);
  return i === -1 || i === VALUE_CYCLE.length - 1 ? "" : VALUE_CYCLE[i + 1]; // "" = remove
}

/** Apply an admin's per-month overrides on top of the generated marks. */
export function applyOverrides(
  base: Record<number, string>, monthKey: string, taskKey: string, overrides: Record<string, string>,
): Record<number, string> {
  const out = { ...base };
  const prefix = `${monthKey}::${taskKey}::`;
  for (const [k, v] of Object.entries(overrides)) {
    if (!k.startsWith(prefix)) continue;
    const day = Number(k.slice(prefix.length));
    if (v === "") delete out[day];
    else out[day] = v;
  }
  return out;
}
