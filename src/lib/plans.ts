export type PlanId = "starter" | "pro" | "agency";

export type Plan = {
  id: PlanId;
  name: string;
  priceUsd: number;
  maxProducts: number;
  maxDmsPerMonth: number;
  stripePriceEnv: string;
  tagline: string;
  /** Only capabilities that are actually implemented belong in this list. */
  features: string[];
};

const SHARED_FEATURES = [
  "Bio store with Stripe & bKash checkout",
  "Instant file delivery and consultation booking",
  "Funnel analytics and orders CRM",
];

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceUsd: 19,
    maxProducts: 3,
    maxDmsPerMonth: 500,
    stripePriceEnv: "STRIPE_PRICE_STARTER",
    tagline: "For a first digital product.",
    features: ["Up to 3 products", "500 Auto-DMs per month", ...SHARED_FEATURES],
  },
  pro: {
    id: "pro",
    name: "Pro Growth",
    priceUsd: 49,
    maxProducts: Number.POSITIVE_INFINITY,
    maxDmsPerMonth: Number.POSITIVE_INFINITY,
    stripePriceEnv: "STRIPE_PRICE_PRO",
    tagline: "For creators selling every day.",
    features: ["Unlimited products", "Unlimited Auto-DMs", ...SHARED_FEATURES],
  },
  agency: {
    id: "agency",
    name: "Agency & Team",
    priceUsd: 99,
    maxProducts: Number.POSITIVE_INFINITY,
    maxDmsPerMonth: Number.POSITIVE_INFINITY,
    stripePriceEnv: "STRIPE_PRICE_AGENCY",
    tagline: "A support tier for people running several creator accounts.",
    features: [
      "Unlimited products",
      "Unlimited Auto-DMs",
      ...SHARED_FEATURES,
      "Same quotas as Pro Growth — one login per creator account",
    ],
  },
};

export const PLAN_LIST: Plan[] = [PLANS.starter, PLANS.pro, PLANS.agency];

export function planOf(id: string | null | undefined) {
  return PLANS[(id as PlanId) || "starter"] ?? PLANS.starter;
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
