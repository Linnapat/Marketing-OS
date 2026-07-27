/* Filtering for the type-to-search pickers (Combobox).
 *
 * Kept apart from the component so the matching rule — the part that decides
 * whether a campaign you know exists shows up — is testable on its own. */

const norm = (s: string) => s.toLowerCase().trim();

/** Every whitespace-separated term must appear somewhere in the option, so
 *  "fest wagyu" finds "Wagyu Festival 2026" and word order does not matter.
 *  An empty query keeps the full list (the dropdown opens showing everything). */
export function comboboxMatches(options: string[], query: string): string[] {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return options;
  return options.filter((option) => {
    const hay = norm(option);
    return terms.every((term) => hay.includes(term));
  });
}
