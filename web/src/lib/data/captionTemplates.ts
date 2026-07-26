/* Saved caption building blocks — hashtag sets, CTAs, and footers (branch info,
 * opening hours, terms) that get reused across posts.
 *
 * Kept per brand: a Teppen hashtag set is noise when writing a Mainichi post,
 * and the footers carry brand-specific branch lists. The store is a plain
 * brand-id → lists map so it round-trips through JSON into org_settings.
 *
 * This module is pure so it can be tested without a database; the Supabase
 * read/write lives in lib/db/captionTemplates.ts. */

import { BrandId } from "@/lib/brands";

export type TemplateKind = "hashtags" | "ctas" | "footers";

export interface CaptionTemplates {
  hashtags: string[];
  ctas: string[];
  footers: string[];
}

/** Per-brand store. A brand with nothing saved is simply absent. */
export type CaptionTemplateStore = Record<BrandId, CaptionTemplates>;

/** Keeps one brand's list from growing unbounded in a shared, team-wide store. */
export const MAX_TEMPLATES = 12;

export const emptyTemplates = (): CaptionTemplates => ({ hashtags: [], ctas: [], footers: [] });

/** The lists for one brand, always a usable object even for an unknown brand. */
export function templatesFor(store: CaptionTemplateStore, brand: BrandId): CaptionTemplates {
  const found = store[brand];
  if (!found) return emptyTemplates();
  return {
    hashtags: [...(found.hashtags ?? [])],
    ctas: [...(found.ctas ?? [])],
    footers: [...(found.footers ?? [])],
  };
}

/** Newest first, trimmed, de-duplicated, capped. Exported for the tests. */
export function normalizeList(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length === MAX_TEMPLATES) break;
  }
  return out;
}

/** Adds a value to one brand's list. Re-saving an existing entry moves it to
 *  the front rather than duplicating it, so the ones in active use stay
 *  reachable once a brand approaches the cap. Returns a new store; an empty
 *  value is a no-op so the "Save" button can't store blanks. */
export function rememberTemplate(
  store: CaptionTemplateStore,
  brand: BrandId,
  kind: TemplateKind,
  value: string,
): CaptionTemplateStore {
  if (!value.trim()) return store;
  const current = templatesFor(store, brand);
  return {
    ...store,
    [brand]: { ...current, [kind]: normalizeList([value, ...current[kind]]) },
  };
}

/** Drops one saved entry. Without this a shared list is append-only: one
 *  person's typo would sit in everyone's picker until the cap pushed it out. */
export function forgetTemplate(
  store: CaptionTemplateStore,
  brand: BrandId,
  kind: TemplateKind,
  value: string,
): CaptionTemplateStore {
  const current = templatesFor(store, brand);
  return {
    ...store,
    [brand]: { ...current, [kind]: current[kind].filter((v) => v !== value) },
  };
}

/** Tolerates whatever shape came back from storage (older payloads, hand-edited
 *  rows, null) and always yields a valid store. */
export function parseStore(raw: unknown): CaptionTemplateStore {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: CaptionTemplateStore = {};
  for (const [brand, lists] of Object.entries(raw as Record<string, unknown>)) {
    if (!lists || typeof lists !== "object" || Array.isArray(lists)) continue;
    const l = lists as Record<string, unknown>;
    const pick = (k: string) => normalizeList(Array.isArray(l[k]) ? (l[k] as unknown[]).filter((v): v is string => typeof v === "string") : []);
    out[brand] = { hashtags: pick("hashtags"), ctas: pick("ctas"), footers: pick("footers") };
  }
  return out;
}
