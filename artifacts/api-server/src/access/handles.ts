// Handle rules. SewSpace owns handles (not Clerk usernames): 3-30 characters of
// lowercase letters, digits, "_" and "."; unique ignoring case; route words and
// a few system names are reserved.

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;

export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  // Route words from the brief.
  "admin", "api", "explore", "feed", "forum", "settings", "studio", "challenges",
  "patterns", "products", "makes", "sign-in", "sign-up", "help",
  // Other app paths and system names.
  "welcome", "me", "saved", "notifications", "about", "privacy", "terms", "support",
  "sewspace", "assets", "sitemap.xml", "robots.txt",
  // Vite dev-server paths under /@ (/@vite/client, /@fs/..., /@id/...).
  "vite", "fs", "id",
]);

export type HandleProblem = "too_short" | "too_long" | "invalid_characters" | "reserved";

/** Trims, removes a leading "@" and lowercases. */
export function normaliseHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/** Returns why a normalised handle cannot be used, or null when the format is fine. */
export function handleProblem(handle: string): HandleProblem | null {
  if (handle.length < HANDLE_MIN) return "too_short";
  if (handle.length > HANDLE_MAX) return "too_long";
  if (!/^[a-z0-9_.]+$/.test(handle)) return "invalid_characters";
  if (RESERVED_HANDLES.has(handle)) return "reserved";
  return null;
}

export const HANDLE_PATH_PATTERN = /^\/@([a-z0-9_.]{3,30})\/?$/;

/** A valid-format base handle derived from a display name ("Ana María" -> "ana.maria"). */
export function handleBaseFromName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, HANDLE_MAX - 3);
  if (!base) return "maker";
  if (base.length >= HANDLE_MIN && !RESERVED_HANDLES.has(base)) return base;
  return `${base}.sews`.slice(0, HANDLE_MAX - 3);
}

/** Candidate handles in order of preference for a base: base, base.sews, base2, base3, ... */
export function handleCandidates(base: string, count = 12): string[] {
  const out = [base, `${base}.sews`.slice(0, HANDLE_MAX)];
  for (let n = 2; out.length < count; n++) out.push(`${base.slice(0, HANDLE_MAX - String(n).length)}${n}`);
  return out.filter((h) => handleProblem(h) === null);
}
