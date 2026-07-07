// Team-shared key/value settings (app_settings table). Falls back to
// localStorage so the feature still works before the migration is run —
// the value just isn't shared across users until then.

import { supabase } from "@/lib/supabase";

const ls = (key: string) => `mos-setting-${key}`;

export async function getAppSetting(key: string): Promise<string | null> {
  const db = supabase();
  if (db) {
    const { data, error } = await db.from("app_settings").select("value").eq("key", key).maybeSingle();
    if (!error && data?.value) return data.value as string;
  }
  if (typeof window !== "undefined") return localStorage.getItem(ls(key));
  return null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  if (typeof window !== "undefined") localStorage.setItem(ls(key), value);
  const db = supabase();
  if (!db) return;
  await db.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
}
