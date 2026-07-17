import { authHeaders } from "@/lib/supabase";
import { BriefSheetResponse } from "@/lib/data/briefSheet";

/** Read a campaign brief from a link-shared Google Sheet built on the template.
 *  Throws with the server's Thai message so the form can show it as-is. */
export async function fetchBriefFromSheet(url: string): Promise<BriefSheetResponse> {
  const res = await fetch(`/api/campaign-brief-sheet?url=${encodeURIComponent(url.trim())}`, { headers: await authHeaders() });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) throw new Error(json?.error ?? "อ่าน sheet ไม่สำเร็จ — ลองใหม่อีกครั้ง");
  return json as BriefSheetResponse;
}
