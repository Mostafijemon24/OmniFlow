import { NextResponse } from "next/server";
import { User } from "@prisma/client";
import { isSuperAdminEmail } from "./admin";
import { getCurrentUser } from "./utils";

type GuardResult = { ok: true; user: User } | { ok: false; response: NextResponse };

/**
 * Server-side super-admin guard for API routes.
 *
 * The email is re-read from the database on every call rather than taken from
 * the session token, so a forged or stale token cannot grant access. Middleware
 * gates the same paths for UX, but it only inspects the JWT — this is the
 * actual authorization boundary and every admin route must call it.
 *
 * Unauthorized callers get 404 rather than 403 so the endpoint's existence is
 * not confirmed.
 */
export async function requireSuperAdmin(): Promise<GuardResult> {
  const notFound = NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await getCurrentUser();
  if (!user) return { ok: false, response: notFound };
  if (!isSuperAdminEmail(user.email)) return { ok: false, response: notFound };

  return { ok: true, user };
}
