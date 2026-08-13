/**
 * Super-admin identity.
 *
 * The admin is designated by the SUPER_ADMIN_EMAIL environment variable, never
 * by a database column, so the role cannot be self-assigned through any API.
 *
 * This module is imported by `src/middleware.ts`, which runs on the edge
 * runtime: it must stay free of `prisma`, `node:crypto` and every other
 * Node-only dependency.
 */

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Configured admin addresses. Empty when SUPER_ADMIN_EMAIL is unset or blank,
 * which means nobody is an admin.
 */
export function superAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAIL ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
}

/**
 * Fails closed: with no configured address this returns false for everyone.
 * Never invert this so that "no admins configured" becomes "everyone is admin".
 */
export function isSuperAdminEmail(email?: string | null): boolean {
  const configured = superAdminEmails();
  if (configured.length === 0) return false;
  if (!email) return false;
  return configured.includes(normalizeEmail(email));
}
