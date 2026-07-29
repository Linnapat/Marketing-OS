// Trash — soft delete with a 7-day window to undo.
//
// "ลบ" ทุกที่ในแอปเปลี่ยนเป็นการเขียน deleted_at/deleted_by ลงแถวเดิม แถวนั้น
// หายจากทุกหน้าทันที แต่ยังกู้คืนได้จนกว่าจะครบ 7 วัน จากนั้นถูกล้างถาวร
// (ดู supabase/soft_delete_trash.sql)
//
// จุดที่ต้องระวัง — migration รันด้วยมือ: ถ้าโค้ดนี้ขึ้น production ก่อนที่จะรัน
// SQL ทุก query ที่เติม "deleted_at is null" จะ error ทั้งหมด (คอลัมน์ยังไม่มี)
// แล้วหน้าเว็บจะว่างเปล่าทั้งแอป — อาการที่ดูเหมือนข้อมูลหาย เราจึงตรวจ
// ความพร้อมของ schema หนึ่งครั้งแล้วจำไว้ ถ้ายังไม่ได้รัน SQL แอปก็ทำงานต่อ
// ได้เหมือนเดิม เพียงแต่ยังไม่มีถังขยะ

import { supabase } from "@/lib/supabase";
import { assertDbOk } from "@/lib/db/assert";

export const TRASH_RETENTION_DAYS = 7;

export type TrashKind = "content" | "campaign" | "graphic" | "task";

interface KindCfg {
  table: string;
  /** คอลัมน์ที่ใช้ชี้แถว — บางตารางเก็บ id จริงไว้ใน data blob */
  idColumn: string;
  label: string;
}

const KINDS: Record<TrashKind, KindCfg> = {
  content: { table: "content_posts", idColumn: "data->>id", label: "Content Plan" },
  campaign: { table: "campaigns", idColumn: "id", label: "Campaign" },
  graphic: { table: "graphic_requests", idColumn: "data->>id", label: "Graphic Request" },
  task: { table: "tasks", idColumn: "data->>id", label: "My Task" },
};

export const trashKindLabel = (kind: TrashKind) => KINDS[kind].label;

// ── Schema readiness ──────────────────────────────────────────────────────
let _ready: boolean | null = null;
let _probe: Promise<boolean> | null = null;

/** มีคอลัมน์ deleted_at แล้วหรือยัง (ตรวจครั้งเดียวต่อ session) */
export async function trashReady(): Promise<boolean> {
  const db = supabase();
  if (!db) return false;              // mock mode — ไม่มี DB ให้ลบแบบ soft
  if (_ready !== null) return _ready;
  if (_probe) return _probe;
  _probe = (async () => {
    const { error } = await db.from("content_posts").select("deleted_at").limit(1);
    // 42703 = undefined_column → ยังไม่ได้รัน migration
    _ready = !error;
    return _ready;
  })();
  return _probe;
}

/** ให้เทสต์/หน้าจอรีเซ็ตผลตรวจได้ หลังรัน migration เสร็จโดยไม่ต้อง reload */
export function resetTrashProbe(): void { _ready = null; _probe = null; }

/** ต่อฐานข้อมูลจริงอยู่หรือเป็น mock — ใช้แยกข้อความ "ยังไม่ได้รัน SQL"
 *  (ของจริง ต้องไปรัน) ออกจาก "ไม่มี DB" (รันในเครื่อง ไม่ต้องทำอะไร) */
export function trashUsesDb(): boolean { return !!supabase(); }

/** เติมเงื่อนไข "ยังไม่ถูกลบ" ให้ query — no-op ถ้ายังไม่ได้รัน migration
 *
 *  รับ/คืน builder ตรง ๆ เพื่อให้เรียกแบบ `liveOnly(db.from(...).select(...))`
 *  ได้ทุกที่ที่ fetch ข้อมูล */
export function liveOnly<T>(query: T, ready: boolean): T {
  if (!ready) return query;
  return (query as { is: (col: string, val: null) => T }).is("deleted_at", null);
}

// ── ลบ / กู้คืน ───────────────────────────────────────────────────────────

/** ย้ายลงถังขยะ คืน false เมื่อ schema ยังไม่พร้อม เพื่อให้ผู้เรียกตัดสินใจ
 *  ว่าจะ fallback ไปลบถาวรหรือจะแจ้งเตือน */
export async function moveToTrash(kind: TrashKind, id: string, by: string): Promise<boolean> {
  const db = supabase();
  if (!db) return true;               // mock mode — หน้าจอจัดการ state เอง
  if (!(await trashReady())) return false;
  const cfg = KINDS[kind];
  const { data, error } = await db.from(cfg.table)
    .update({ deleted_at: new Date().toISOString(), deleted_by: by })
    .eq(cfg.idColumn, id)
    .is("deleted_at", null)           // ลบซ้ำต้องไม่รีเซ็ตนาฬิกา 7 วัน
    .select("id");
  assertDbOk(error, `ย้าย ${cfg.label} ลงถังขยะไม่สำเร็จ`);
  if (!data?.length) throw new Error(`ไม่พบรายการนี้ (id ${id}) — ลอง refresh แล้วลบใหม่`);
  return true;
}

/** กู้คืนจากถังขยะ */
export async function restoreFromTrash(kind: TrashKind, id: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  const cfg = KINDS[kind];
  const { data, error } = await db.from(cfg.table)
    .update({ deleted_at: null, deleted_by: null })
    .eq(cfg.idColumn, id)
    .select("id");
  assertDbOk(error, `กู้คืน ${cfg.label} ไม่สำเร็จ`);
  if (!data?.length) throw new Error("กู้คืนไม่สำเร็จ — รายการอาจถูกล้างถาวรไปแล้ว");
}

/** ล้างรายการเดียวออกถาวร (ปุ่ม "ลบถาวร" ในหน้า Trash) */
export async function purgeOne(kind: TrashKind, id: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  const cfg = KINDS[kind];
  const { error } = await db.from(cfg.table).delete().eq(cfg.idColumn, id).not("deleted_at", "is", null);
  assertDbOk(error, `ลบถาวรไม่สำเร็จ`);
}

// ── อ่านถังขยะ ────────────────────────────────────────────────────────────

export interface TrashEntry {
  kind: TrashKind;
  id: string;
  title: string;
  brand?: string;
  campaign?: string;
  deletedAt: string;
  deletedBy: string;
  /** เหลืออีกกี่วันก่อนถูกล้างถาวร (ปัดขึ้น, 0 = วันนี้) */
  daysLeft: number;
}

const titleOf = (row: Record<string, unknown>): string => {
  const data = row.data as Record<string, unknown> | null;
  const t = (data?.title ?? data?.name ?? row.title ?? row.name) as string | undefined;
  return (t || "").trim() || "(ไม่มีชื่อ)";
};

const idOf = (kind: TrashKind, row: Record<string, unknown>): string => {
  if (kind === "campaign") return String(row.id);
  const data = row.data as Record<string, unknown> | null;
  return String(data?.id ?? row.id);
};

function daysLeft(deletedAt: string, now: number): number {
  const elapsed = now - new Date(deletedAt).getTime();
  const left = TRASH_RETENTION_DAYS - elapsed / 86_400_000;
  return Math.max(0, Math.ceil(left));
}

/** ทุกอย่างในถังขยะ เรียงจากที่เพิ่งลบล่าสุด
 *
 *  RLS เดิมยัง scope ตามแบรนด์อยู่ ถังขยะจึงแสดงเฉพาะของที่คน ๆ นั้นมีสิทธิ์เห็น */
export async function fetchTrash(): Promise<TrashEntry[]> {
  const db = supabase();
  if (!db || !(await trashReady())) return [];
  const now = Date.now();
  const kinds = Object.keys(KINDS) as TrashKind[];
  const results = await Promise.all(kinds.map(async (kind) => {
    const cfg = KINDS[kind];
    // campaigns เก็บชื่อ/แบรนด์เป็นคอลัมน์จริง ส่วนที่เหลืออยู่ใน data blob
    const { data, error } = await db.from(cfg.table)
      .select("id, data, brand, campaign, deleted_at, deleted_by")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((row) => ({
      kind,
      id: idOf(kind, row),
      title: titleOf(row),
      brand: (row.brand as string) ?? ((row.data as Record<string, unknown>)?.b as string) ?? undefined,
      campaign: (row.campaign as string) ?? ((row.data as Record<string, unknown>)?.campaign as string) ?? undefined,
      deletedAt: String(row.deleted_at),
      deletedBy: (row.deleted_by as string) || "—",
      daysLeft: daysLeft(String(row.deleted_at), now),
    }));
  }));
  return results.flat().sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/** ล้างของที่เกินกำหนด เรียกตอนเปิดหน้า Trash เพื่อให้กติกา 7 วันเป็นจริง
 *  แม้ยังไม่ได้ตั้ง pg_cron  เงียบเสมอ — ล้างไม่สำเร็จไม่ควรกันไม่ให้เปิดหน้า */
export async function purgeExpiredTrash(): Promise<number> {
  const db = supabase();
  if (!db || !(await trashReady())) return 0;
  const { data, error } = await db.rpc("purge_expired_trash", { retain_days: TRASH_RETENTION_DAYS });
  if (error) return 0;
  return typeof data === "number" ? data : 0;
}
