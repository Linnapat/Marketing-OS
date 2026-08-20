"use client";

// "Have we got this creator already?" — asked of the LINK, not of the name.
//
// The library holds ten pairs of the same person saved twice under two
// spellings ("dear.rari" / "dearari7 เดียราริ" / "เดียราริ" is one creator on
// three rows). Nothing warned whoever saved the second one: the only check
// available was reading a list of names, one of which may be written in a
// language the previous person did not use. This asks the question the moment
// a link is typed, and answers it with the row that already exists.

import { useEffect, useState } from "react";
import { findKolByProfileLink, KolDuplicate } from "@/lib/db/kolScorecard";
import { profileLinkKey } from "@/lib/data/kolSearch";

/** Looks up whatever link is currently typed. Debounced, and quiet while the
 *  box holds nothing a profile could be recognised from. */
export function useDuplicateLink(link: string, excludeKolId?: string) {
  const [matches, setMatches] = useState<KolDuplicate[]>([]);
  const key = profileLinkKey(link);
  useEffect(() => {
    if (!key) { setMatches([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      findKolByProfileLink(link, excludeKolId)
        .then((rows) => { if (alive) setMatches(rows); })
        .catch(() => { if (alive) setMatches([]); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
    // Keyed on the identity, not the raw text: retyping the same profile with a
    // "?hl=th" on the end is not a new question.
  }, [key, link, excludeKolId]);
  return matches;
}

/** A warning, deliberately not a block. The team does keep two rows on purpose
 *  sometimes (an agency page and a personal one), and a hard stop on a rule
 *  this fuzzy would be worse than the duplicates — so it says who it found and
 *  lets the person decide. */
export function DuplicateLinkWarning({ matches, className = "" }: { matches: KolDuplicate[]; className?: string }) {
  if (!matches.length) return null;
  return (
    <div className={`rounded-[9px] px-3 py-[7px] text-[11.5px] ${className}`}
      style={{ background: "#FFF7ED", border: "1px solid #F0C89B", color: "#8A5418" }}>
      <span className="font-bold">⚠ ลิงก์นี้มีในทะเบียนแล้ว</span>
      <span className="ml-1">— {matches.length > 1 ? `${matches.length} โปรไฟล์: ` : ""}</span>
      {matches.map((m, i) => (
        <span key={m.kol_id}>
          {i > 0 && ", "}
          <a href={`/kol/${m.kol_id}`} target="_blank" rel="noreferrer" className="font-bold underline">
            {m.display_name}
          </a>
          {m.platform ? <span className="opacity-70"> ({m.platform})</span> : null}
        </span>
      ))}
      <div className="mt-[3px] opacity-80">เปิดของเดิมแล้วแก้ที่นั่นดีกว่า — บันทึกใหม่จะได้คนซ้ำสองแถว</div>
    </div>
  );
}
