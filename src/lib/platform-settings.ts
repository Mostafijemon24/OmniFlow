import { PlatformSettings } from "@prisma/client";
import { prisma } from "./prisma";
import { decrypt } from "./crypto";
import { PlanId } from "./plans";

export const PLATFORM_SETTINGS_ID = "platform";

/**
 * Read-through cache. `/api/auth/session` is polled by every mounted
 * `useSession()`, and the Facebook provider is built from these values on each
 * auth request, so an uncached read would be the hottest query in the app.
 * Admin writes invalidate it immediately; other processes converge within the
 * TTL.
 */
const CACHE_TTL_MS = 30_000;
let cached: { at: number; value: PlatformSettings | null } | null = null;

export function invalidatePlatformSettingsCache() {
  cached = null;
}

export async function getPlatformSettings(): Promise<PlatformSettings | null> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  const value = await prisma.platformSettings.findUnique({
    where: { id: PLATFORM_SETTINGS_ID },
  });
  cached = { at: Date.now(), value };
  return value;
}

export async function savePlatformSettings(data: Record<string, unknown>) {
  const saved = await prisma.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: { id: PLATFORM_SETTINGS_ID, ...data },
    update: data,
  });
  invalidatePlatformSettingsCache();
  return saved;
}

/* -------------------------------------------------------------------------- */
/* Gateways                                                                    */
/* -------------------------------------------------------------------------- */

export type GatewayId = "Stripe" | "bKash";

export type GatewayAvailability = {
  stripe: boolean;
  bkash: boolean;
  bkashNumber: string | null;
  bkashInstructions: string | null;
  bkashUsdRate: number | null;
};

const NOTHING: GatewayAvailability = {
  stripe: false,
  bkash: false,
  bkashNumber: null,
  bkashInstructions: null,
  bkashUsdRate: null,
};

function stripePriceId(settings: PlatformSettings, plan: PlanId) {
  const byPlan: Record<PlanId, string | null> = {
    starter: settings.stripePriceStarter,
    pro: settings.stripePricePro,
    agency: settings.stripePriceAgency,
  };
  return byPlan[plan]?.trim() || null;
}

export async function stripePriceIdFor(plan: PlanId) {
  const settings = await getPlatformSettings();
  return settings ? stripePriceId(settings, plan) : null;
}

/** A gateway is offered only when it is both switched on and usable. */
function bkashUsable(settings: PlatformSettings) {
  return Boolean(
    settings.bkashEnabled &&
      settings.bkashNumber?.trim() &&
      settings.bkashUsdRate &&
      settings.bkashUsdRate > 0
  );
}

function bkashDetails(settings: PlatformSettings) {
  return {
    bkashNumber: settings.bkashNumber?.trim() || null,
    bkashInstructions: settings.bkashInstructions?.trim() || null,
    bkashUsdRate: settings.bkashUsdRate ?? null,
  };
}

/** Gateways that can be used to buy one specific OmniFlow plan. */
export async function planGateways(plan: PlanId): Promise<GatewayAvailability> {
  const settings = await getPlatformSettings();
  if (!settings) return NOTHING;

  return {
    stripe: Boolean(
      settings.stripeEnabled && settings.stripeSecretKey && stripePriceId(settings, plan)
    ),
    bkash: bkashUsable(settings),
    ...bkashDetails(settings),
  };
}

/**
 * Gateways a buyer can use on a creator storefront.
 *
 * Selling on behalf of creators is not switched on yet, so this resolves to
 * nothing and paid products cannot be purchased. That is the toggle doing its
 * job, not a special case: flipping `storePaymentsEnabled` is what will open it.
 */
export async function storeGateways(currencyCode: string): Promise<GatewayAvailability> {
  const settings = await getPlatformSettings();
  if (!settings || !settings.storePaymentsEnabled) return NOTHING;

  // Stripe has no BDT presentment currency; bKash only moves BDT.
  const stripeCurrencies = ["USD", "EUR", "GBP"];

  return {
    stripe: Boolean(
      settings.stripeEnabled &&
        settings.stripeSecretKey &&
        stripeCurrencies.includes(currencyCode)
    ),
    bkash: bkashUsable(settings) && currencyCode === "BDT",
    ...bkashDetails(settings),
  };
}

/** BDT amount, in cents (poisha), for a USD plan price. */
export async function bkashAmountCentsForUsd(usd: number) {
  const settings = await getPlatformSettings();
  if (!settings?.bkashUsdRate || settings.bkashUsdRate <= 0) return null;
  return Math.round(usd * settings.bkashUsdRate * 100);
}

/* -------------------------------------------------------------------------- */
/* Meta connector                                                              */
/* -------------------------------------------------------------------------- */

export type MetaConnector = {
  appId: string;
  appSecret: string;
  verifyToken: string | null;
  graphVersion: string;
  graphApi: string;
};

/**
 * Decrypted Meta app credentials, or null when the admin has not configured the
 * connector. Callers pass the result down rather than re-reading it, so one
 * request performs one read.
 */
export async function metaConnector(): Promise<MetaConnector | null> {
  const settings = await getPlatformSettings();
  if (!settings || !settings.metaEnabled) return null;
  if (!settings.metaAppId?.trim() || !settings.metaAppSecret) return null;

  try {
    const graphVersion = settings.metaGraphVersion?.trim() || "v21.0";
    return {
      appId: settings.metaAppId.trim(),
      appSecret: decrypt(settings.metaAppSecret),
      verifyToken: settings.metaVerifyToken ? decrypt(settings.metaVerifyToken) : null,
      graphVersion,
      graphApi: `https://graph.facebook.com/${graphVersion}`,
    };
  } catch {
    // Credentials encrypted under a different ENCRYPTION_KEY are unusable.
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Secrets                                                                     */
/* -------------------------------------------------------------------------- */

export async function platformStripeSecretKey(): Promise<string | null> {
  const settings = await getPlatformSettings();
  if (!settings?.stripeEnabled || !settings.stripeSecretKey) return null;
  try {
    return decrypt(settings.stripeSecretKey);
  } catch {
    return null;
  }
}

export async function platformStripeWebhookSecret(): Promise<string | null> {
  const fromEnv = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (fromEnv) return fromEnv;

  const settings = await getPlatformSettings();
  if (!settings?.stripeWebhookSecret) return null;
  try {
    return decrypt(settings.stripeWebhookSecret);
  } catch {
    return null;
  }
}
