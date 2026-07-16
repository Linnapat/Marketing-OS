import type { Role } from "@/lib/role";

// Single source of truth for the default approver role. Previously the literal
// "CMO" was scattered across campaign/brief/finance routing as the fallback
// approver, so changing who approves by default meant editing ~10 files (audit
// P2-6). Route every "no explicit approver set" fallback through here instead.
// (Type-only import of Role is erased at build time, so this stays a plain,
// non-client module safe to import from both server and client code.)
export const DEFAULT_APPROVER: Role = "CMO";
