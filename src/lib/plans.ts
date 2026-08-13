export type PlanId = "starter" | "pro" | "agency";

export type Plan = {
  id: PlanId;
  name: string;
  priceUsd: number;
  maxProducts: number;
  maxDmsPerMonth: number;
  tagline: string;
  /** Only capabilities that are actually implemented belong in this list. */
  features: string[];
};

const SHARED_FEATURES = [
  "Bio store with instant file delivery",
  "Consultation booking with slot management",
  "Funnel analytics and orders CRM",
];

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceUsd: 19,
    maxProducts: 3,
    maxDmsPerMonth: 500,
    tagline: "For a first digital product.",
    features: ["Up to 3 products", "500 Auto-DMs per month", ...SHARED_FEATURES],
  },
  pro: {
    id: "pro",
    name: "Pro Growth",
    priceUsd: 49,
    maxProducts: 25,
    maxDmsPerMonth: 5000,
    tagline: "For creators selling every day.",
    features: ["Up to 25 products", "5,000 Auto-DMs per month", ...SHARED_FEATURES],
  },
  agency: {
    id: "agency",
    name: "Agency Volume",
    priceUsd: 99,
    maxProducts: 100,
    maxDmsPerMonth: 25000,
    tagline: "For high-volume catalogues and comment traffic.",
    features: ["Up to 100 products", "25,000 Auto-DMs per month", ...SHARED_FEATURES],
  },
};

export const PLAN_LIST: Plan[] = [PLANS.starter, PLANS.pro, PLANS.agency];

export function planOf(id: string | null | undefined) {
  return PLANS[(id as PlanId) || "starter"] ?? PLANS.starter;
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && value in PLANS;
}

/**
 * Manually paid plans do not auto-renew, so entitlements have to be checked
 * against the paid-up-to date rather than the stored plan name alone. Stripe
 * subscriptions renew themselves and are governed by webhooks instead.
 */
export type PlanHolder = {
  plan: string;
  planPeriodEnd: Date | null;
  stripeSubscriptionId: string | null;
};

export function planExpired(user: PlanHolder) {
  if (user.stripeSubscriptionId) return false;
  if (!user.planPeriodEnd) return false;
  return user.planPeriodEnd.getTime() < Date.now();
}

/** The plan whose limits actually apply right now. */
export function effectivePlanOf(user: PlanHolder) {
  return planExpired(user) ? PLANS.starter : planOf(user.plan);
}

export function daysUntil(date: Date | null) {
  if (!date) return null;
  const ms = date.getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86400000);
}

/** UTC so the quota window does not shift with the host's timezone. */
export function monthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function trialDaysLeft(trialEndsAt: Date | null) {
  if (!trialEndsAt) return 0;
  const ms = trialEndsAt.getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86400000);
}
