// The one number a campaign is called by.
//
// A campaign used to show two: the app's per-brand running code and a
// hand-written one typed into the name ("CPN010_Seasonal menu"). The names were
// cleaned up on 31 Jul 2026, which only works if the running code is visible
// wherever a campaign name is — otherwise the modules lost a number instead of
// agreeing on one. Same pill everywhere so it reads as the same thing.
//
// Renders nothing without a code: campaigns created before the code existed have
// all been backfilled, but a row read from an older cache still might not have one,
// and an empty pill would look like a bug.

export function CampaignCode({ code, className }: { code?: string; className?: string }) {
  if (!code) return null;
  return (
    <span
      className={`text-[11px] font-extrabold rounded-pill px-[7px] py-[2px] whitespace-nowrap ${className ?? ""}`}
      style={{ background: "#F2EEFF", color: "#6C5CE7" }}
      title="รหัสแคมเปญ"
    >
      #{code}
    </span>
  );
}

/** `#TPN-2026-006 · Seasonal menu` as plain text, for the places that take a
 *  string rather than a node — tooltips, notification bodies, exports. */
export function campaignLabel(code: string | undefined, name: string): string {
  return code ? `#${code} · ${name}` : name;
}

/** The job number of one post or artwork (TPN_2609_003-C02-A01).
 *
 *  Deliberately a different colour from the campaign pill. The two sit side by
 *  side on the same row and the work code CONTAINS the campaign code, so in one
 *  colour a row would read as the same number printed twice.
 *
 *  Shows only the part below the campaign by default ("C02-A01"), because the
 *  campaign is almost always already named on the row; `full` prints the whole
 *  thing for the surfaces where it stands alone. The title attribute always
 *  carries the full code, so it can be copied from anywhere. */
export function WorkCode({ code, full, className }: { code?: string; full?: boolean; className?: string }) {
  if (!code) return null;
  const short = code.includes("-") ? code.slice(code.indexOf("-") + 1) : code;
  return (
    <span
      className={`text-[11px] font-extrabold rounded-pill px-[7px] py-[2px] whitespace-nowrap ${className ?? ""}`}
      style={{ background: "#EAF2EC", color: "#3F7A52" }}
      title={`เลขงาน: ${code}`}
    >
      {full ? code : short}
    </span>
  );
}
