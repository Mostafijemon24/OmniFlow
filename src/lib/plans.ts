export type PlanId = "starter" | "pro" | "agency";

export const PLANS: Record<
  PlanId,
  {
    id: PlanId;
    name: string;
    priceUsd: number;
    maxProducts: number;
    maxDmsPerMonth: number;
    stripePriceEnv: string;
  }
> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceUsd: 19,
    maxProducts: 3,
    maxDmsPerMonth: 500,
    stripePriceEnv: "STRIPE_PRICE_STARTER",
  },
  pro: {
    id: "pro",
    name: "Pro Growth",
    priceUsd: 49,
    maxProducts: Number.POSITIVE_INFINITY,
    maxDmsPerMonth: Number.POSITIVE_INFINITY,
    stripePriceEnv: "STRIPE_PRICE_PRO",
  },
  agency: {
    id: "agency",
    name: "Agency & Team",
    priceUsd: 99,
    maxProducts: Number.POSITIVE_INFINITY,
    maxDmsPerMonth: Number.POSITIVE_INFINITY,
    stripePriceEnv: "STRIPE_PRICE_AGENCY",
  },
};

export function planOf(id: string | null | undefined) {
  return PLANS[(id as PlanId) || "starter"] ?? PLANS.starter;
}

export function monthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function trialDaysLeft(trialEndsAt: Date | null) {
  if (!trialEndsAt) return 0;
  const ms = trialEndsAt.getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86400000);
}
