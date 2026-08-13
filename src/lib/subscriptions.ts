import { prisma } from "./prisma";
import { PlanId, PLANS, daysUntil } from "./plans";

/** One manually paid period. Renewal is a fresh payment, not an auto-charge. */
export const MANUAL_PERIOD_DAYS = 30;

/** Creators are warned this many days before a manual plan lapses. */
export const EXPIRY_WARNING_DAYS = 7;

/**
 * Grants a manually paid plan.
 *
 * The period extends from whichever is later: now, or the end of the period the
 * creator has already paid for. Renewing early therefore adds time instead of
 * throwing away the remainder.
 */
export async function activateManualPlan(userId: string, plan: PlanId, now = new Date()) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planPeriodEnd: true },
  });
  if (!user) return null;

  const samePlan = user.plan === plan;
  const unexpired =
    samePlan && user.planPeriodEnd && user.planPeriodEnd.getTime() > now.getTime()
      ? user.planPeriodEnd
      : now;

  const periodEnd = new Date(unexpired.getTime() + MANUAL_PERIOD_DAYS * 86400000);

  return prisma.user.update({
    where: { id: userId },
    data: { plan, planStatus: "active", planPeriodEnd: periodEnd, trialEndsAt: null },
  });
}

export type PlanState = {
  plan: string;
  planStatus: string;
  planPeriodEnd: Date | null;
  stripeSubscriptionId: string | null;
};

/**
 * How the plan should be described to its owner: whether it lapses on a date,
 * how soon, and whether that has already happened.
 */
export function planNotice(user: PlanState) {
  if (user.stripeSubscriptionId || !user.planPeriodEnd) return null;

  const days = daysUntil(user.planPeriodEnd);
  const expired = user.planPeriodEnd.getTime() < Date.now();
  const name = PLANS[user.plan as PlanId]?.name ?? user.plan;

  if (expired) {
    return {
      level: "expired" as const,
      message: `Your ${name} plan expired on ${user.planPeriodEnd.toDateString()}. Starter limits now apply — renew to restore it.`,
    };
  }
  if (days !== null && days <= EXPIRY_WARNING_DAYS) {
    return {
      level: "expiring" as const,
      message: `Your ${name} plan ends in ${days} day${days === 1 ? "" : "s"}. Manual payments do not renew automatically.`,
    };
  }
  return {
    level: "active" as const,
    message: `Your ${name} plan is paid until ${user.planPeriodEnd.toDateString()}.`,
  };
}
