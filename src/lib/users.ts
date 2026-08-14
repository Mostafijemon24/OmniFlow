import { isUniqueViolation, prisma } from "./prisma";
import { slugifyHandle } from "./utils";
import { isSuperAdminEmail } from "./admin";
import { User } from "@prisma/client";

export const TRIAL_DAYS = 14;

type CreateArgs = {
  email: string;
  fullName: string;
  passwordHash?: string | null;
  avatar?: string | null;
};

export type CreateResult =
  | { ok: true; user: Awaited<ReturnType<typeof prisma.user.create>> }
  | { ok: false; reason: "email_taken" | "no_handle" };

/**
 * Creates a creator account, allocating a free handle.
 *
 * Shared by password registration and Facebook signup so both paths produce
 * identical accounts — same trial, same handle rules, same uniqueness races
 * handled the same way.
 */
export async function createCreatorAccount(args: CreateArgs): Promise<CreateResult> {
  const email = args.email.toLowerCase().trim();
  const fullName = args.fullName.trim();
  const platformOwner = isSuperAdminEmail(email);

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return { ok: false, reason: "email_taken" };
  }

  const base = slugifyHandle(fullName) || "creator";

  // Handles are unique, so a concurrent signup with the same display name is
  // retried rather than surfaced as a server error.
  for (let attempt = 0; attempt < 10; attempt++) {
    const username = attempt === 0 ? base : `${base}${attempt}`;
    try {
      const user = await prisma.user.create({
        data: {
          email,
          fullName,
          username,
          passwordHash: args.passwordHash ?? null,
          avatar: args.avatar ?? null,
          plan: platformOwner ? "agency" : "starter",
          planStatus: platformOwner ? "active" : "trialing",
          trialEndsAt: platformOwner ? null : new Date(Date.now() + TRIAL_DAYS * 86400000),
        },
      });
      return { ok: true, user };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
        return { ok: false, reason: "email_taken" };
      }
    }
  }

  return { ok: false, reason: "no_handle" };
}

/** Platform owner is not a trial creator. Keep their row in sync on each admin/profile read. */
export async function ensureSuperAdminEntitlements(user: User) {
  if (!isSuperAdminEmail(user.email)) return user;
  if (user.plan === "agency" && user.planStatus === "active" && !user.trialEndsAt) return user;

  return prisma.user.update({
    where: { id: user.id },
    data: {
      plan: "agency",
      planStatus: "active",
      trialEndsAt: null,
      planPeriodEnd: null,
    },
  });
}
