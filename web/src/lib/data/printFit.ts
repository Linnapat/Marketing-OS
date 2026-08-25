// Fitting a sheet onto one printed page.
//
// Pure arithmetic on purpose: the measuring lives in the page (it needs the
// DOM), but the decision — how far to shrink, when to refuse, how many pages
// the reader will actually get — is where the mistakes are, and mistakes here
// are the kind nobody notices until the printer has already produced page two.

/** A4 landscape at 8mm margins, in CSS pixels at 96dpi — the box one printed
 *  page actually gives us. Mirrors the `@page` rule on the print sheet: change
 *  one and this has to change with it. */
export const PAGE_W_PX = ((297 - 16) * 96) / 25.4;
export const PAGE_H_PX = ((210 - 16) * 96) / 25.4;

/** How far the sheet may be shrunk before the print stops being worth taping
 *  up. Body text prints at 8.6px ≈ 6.5pt; at 0.7 that is about 4.5pt, roughly
 *  what a person can still read standing at a wall. Below this the honest
 *  answer is "print fewer rows", not a smaller font. */
export const MIN_FIT_ZOOM = 0.7;

/** Aim at 97% of the page rather than 100%.
 *
 *  The height comes from a simulation — a clone laid out at paper width — and
 *  a simulation that lands a few pixels optimistic produces the one outcome
 *  this feature exists to prevent: a sheet that claims to fit and prints a
 *  second page holding three rows. Three percent of a page is about one row of
 *  headroom, and it costs three percent of an already-small font. */
export const FIT_SAFETY = 0.97;

/** The usable height per page once the safety margin is taken. */
export const fitBudget = () => PAGE_H_PX * FIT_SAFETY;

/** The zoom that puts `height` on one page, or 1 when it already fits.
 *
 *  Never scales UP — a one-row sheet blown up to fill A4 is a poster, not a
 *  fix — and never goes below the floor, where the answer stops being zoom.
 *  Rounded DOWN to two decimals for the same reason as the safety margin:
 *  every rounding here errs towards a slightly smaller sheet, never a slightly
 *  larger one. */
export function fitZoom(height: number, enabled = true): number {
  if (!enabled || !Number.isFinite(height) || height <= 0) return 1;
  const budget = fitBudget();
  if (height <= budget) return 1;
  return Math.max(MIN_FIT_ZOOM, Math.floor((budget / height) * 100) / 100);
}

/** How many pages come out, given a height and the zoom being applied.
 *
 *  Reported rather than promised: at the floor a long sheet still runs over,
 *  and the screen has to say so instead of showing a "1 หน้า" that the printer
 *  will contradict. */
export function pagesWhenPrinted(height: number, zoom: number): number {
  if (!Number.isFinite(height) || height <= 0) return 1;
  return Math.max(1, Math.ceil((height * zoom) / fitBudget()));
}

/** Pages at full size — what the sheet costs if nothing is shrunk. */
export function pagesAtFullSize(height: number): number {
  return pagesWhenPrinted(height, 1);
}
