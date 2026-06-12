/**
 * Validates and returns a safe internal redirect path.
 * Prevents open redirect attacks by ensuring the path:
 * - starts with /
 * - does not start with // (protocol-relative external URL)
 * - does not contain a protocol (http://, https://)
 * Falls back to /dashboard if invalid or missing.
 */
export function getSafeRedirectPath(
  from: string | null | undefined,
  fallback = '/dashboard',
): string {
  if (!from) return fallback;

  if (!from.startsWith('/') || from.startsWith('//')) return fallback;

  // Must not contain a protocol
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(from)) return fallback;

  // Must not contain @  (//user@host style attacks)
  if (from.includes('@')) return fallback;

  return from;
}