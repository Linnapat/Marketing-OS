/* Caption template storage. Saved sets live in org_settings so the whole team
 * shares one library — they used to sit in localStorage, which meant each
 * browser had its own copy and clearing the cache lost them.
 *
 * localStorage is kept as a mirror, not as the source of truth: it lets demo
 * mode (no Supabase env) still work, and serves as a cache if a read fails. */

import { fetchJsonSetting, saveJsonSetting } from "@/lib/db/settings";
import { CaptionTemplateStore, parseStore } from "@/lib/data/captionTemplates";

const SETTING_KEY = "caption_templates_config";
const SETTING_LABEL = "Caption Templates";
const MIRROR_KEY = "mos-caption-templates";

function readMirror(): CaptionTemplateStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MIRROR_KEY);
    return raw ? parseStore(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function writeMirror(store: CaptionTemplateStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MIRROR_KEY, JSON.stringify(store));
  } catch {
    // Private browsing / quota — the Supabase write below is what matters.
  }
}

export async function fetchCaptionTemplates(): Promise<CaptionTemplateStore> {
  const saved = await fetchJsonSetting<unknown>(SETTING_KEY).catch(() => null);
  if (saved) {
    const store = parseStore(saved);
    writeMirror(store);
    return store;
  }
  return readMirror();
}

/** Persists the whole store. Mirrors locally first so the picker still reflects
 *  the change if the network write fails and the error is surfaced. */
export async function saveCaptionTemplates(store: CaptionTemplateStore): Promise<void> {
  writeMirror(store);
  await saveJsonSetting(SETTING_KEY, SETTING_LABEL, store);
}
