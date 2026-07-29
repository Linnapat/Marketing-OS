// Editable Work Calendar rows.
//
// The rows ship in code (WORK_SECTIONS) because they came from the team's own
// sheet, but the team has to be able to add, rename and retire them — and now
// that the calendar drives every module's deadlines, a row nobody can add is a
// deadline nobody can express.
//
// Rather than copying the whole template into the database (which would freeze
// it, so shipped improvements never reach anyone), only the DIFFERENCE is
// stored: patches to template rows, plus any rows the team invented.
//
// ── Identity ──────────────────────────────────────────────────────────────
// A row's key is `${section}::${original English name}` and never changes. The
// day markers and done-marks are filed under it, so renaming "Final AW" must
// keep the key — otherwise every marker on that row is orphaned and the
// deadline it drives silently disappears. Custom rows get `${section}::~<id>`;
// the tilde cannot collide with a template name.

import { WorkSection, WorkTask, WORK_SECTIONS } from "@/lib/data/workflow";

export interface CalendarTaskEdit {
  /** Stable identity — see above. */
  key: string;
  section: string;
  /** Present = renamed/patched. Absent = inherit the template's value. */
  en?: string;
  jp?: string;
  r?: string;
  a?: string;
  qty?: string;
  note?: string;
  link?: string;
  /** A row the team added; it has no template behind it. */
  custom?: boolean;
  /** Retired. Template rows can only be hidden, never deleted — the template
   *  is code, and a "delete" that a redeploy undoes is worse than a hide. */
  hidden?: boolean;
}

/** A row as the calendar should actually render it. */
export interface ResolvedTask extends WorkTask {
  key: string;
  custom: boolean;
}

export interface ResolvedCalendarSection extends Omit<WorkSection, "tasks"> {
  tasks: ResolvedTask[];
}

export const templateTaskKey = (sectionKey: string, en: string) => `${sectionKey}::${en}`;

/** Next free custom key for a section — stable and readable in the blob. */
export function nextCustomKey(sectionKey: string, edits: CalendarTaskEdit[]): string {
  const used = edits
    .filter((e) => e.custom && e.section === sectionKey)
    .map((e) => Number(/~(\d+)$/.exec(e.key)?.[1] ?? 0));
  return `${sectionKey}::~${Math.max(0, ...used) + 1}`;
}

const applyPatch = (base: WorkTask, edit?: CalendarTaskEdit): WorkTask => (edit
  ? {
    ...base,
    en: edit.en ?? base.en,
    jp: edit.jp ?? base.jp,
    r: edit.r ?? base.r,
    a: edit.a ?? base.a,
    qty: edit.qty ?? base.qty,
    note: edit.note ?? base.note,
    link: edit.link ?? base.link,
  }
  : base);

/** The calendar's rows: the shipped template, patched and extended by the
 *  team's edits. Hidden rows are dropped.
 *
 *  Pure, so the grid, the export and the deadline resolver all see the same
 *  list — a deadline read from a row the grid no longer shows would be a lie. */
export function resolveCalendarSections(edits: CalendarTaskEdit[] = []): ResolvedCalendarSection[] {
  const byKey = new Map(edits.map((e) => [e.key, e]));
  return WORK_SECTIONS.map((sec) => {
    const fromTemplate: ResolvedTask[] = sec.tasks
      .map((t) => {
        const key = templateTaskKey(sec.key, t.en);
        const edit = byKey.get(key);
        if (edit?.hidden) return null;
        return { ...applyPatch(t, edit), key, custom: false };
      })
      .filter((t): t is ResolvedTask => !!t);

    const added: ResolvedTask[] = edits
      .filter((e) => e.custom && e.section === sec.key && !e.hidden)
      .map((e) => ({
        en: e.en ?? "(ไม่มีชื่อ)",
        jp: e.jp ?? "",
        r: e.r ?? "",
        a: e.a ?? "",
        qty: e.qty,
        note: e.note,
        link: e.link,
        // Custom rows carry no template markers: their days are set by clicking
        // cells, which lands in `overrides` under this key like any other row.
        marks: {},
        key: e.key,
        custom: true,
      }));

    return { ...sec, tasks: [...fromTemplate, ...added] };
  });
}

/** Find one resolved row by key. */
export function findCalendarTask(key: string, edits: CalendarTaskEdit[] = []): ResolvedTask | null {
  for (const sec of resolveCalendarSections(edits)) {
    const hit = sec.tasks.find((t) => t.key === key);
    if (hit) return hit;
  }
  return null;
}

/** Upsert an edit, keyed by the row's identity. */
export function withTaskEdit(edits: CalendarTaskEdit[], edit: CalendarTaskEdit): CalendarTaskEdit[] {
  const at = edits.findIndex((e) => e.key === edit.key);
  if (at === -1) return [...edits, edit];
  const next = [...edits];
  next[at] = { ...next[at], ...edit };
  return next;
}

/** Remove a row.
 *
 *  A CUSTOM row is dropped outright — the team made it, the team can unmake it.
 *  A TEMPLATE row is only marked hidden, because the row itself lives in code
 *  and would return on the next deploy. */
export function withTaskRemoved(edits: CalendarTaskEdit[], key: string, section: string): CalendarTaskEdit[] {
  const existing = edits.find((e) => e.key === key);
  if (existing?.custom) return edits.filter((e) => e.key !== key);
  return withTaskEdit(edits, { key, section, hidden: true });
}

/** Bring a hidden template row back. */
export function withTaskRestored(edits: CalendarTaskEdit[], key: string): CalendarTaskEdit[] {
  return edits.map((e) => (e.key === key ? { ...e, hidden: false } : e));
}

/** Template rows the team has retired — so the editor can offer them back
 *  instead of leaving them gone with no way to find them. */
export function hiddenTemplateTasks(edits: CalendarTaskEdit[] = []): { key: string; section: string; en: string }[] {
  return edits
    .filter((e) => e.hidden && !e.custom)
    .map((e) => {
      const sec = WORK_SECTIONS.find((s) => s.key === e.section);
      const original = sec?.tasks.find((t) => templateTaskKey(e.section, t.en) === e.key);
      return { key: e.key, section: e.section, en: e.en ?? original?.en ?? e.key };
    });
}
