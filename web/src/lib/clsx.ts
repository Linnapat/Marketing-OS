// Tiny classnames helper — avoids a dependency for the common conditional-class case.
export function clsx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
