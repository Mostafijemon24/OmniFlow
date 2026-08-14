import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/guards";
import { encrypt } from "@/lib/crypto";
import { stripeClient } from "@/lib/stripe";
import { getPlatformSettings, savePlatformSettings } from "@/lib/platform-settings";
import { isEmailConfigured } from "@/lib/email";
import { appUrl } from "@/lib/utils";
import { isStripePriceId, normalizeStripePriceId, parseRate } from "@/lib/digits";

/** "" clears a stored value; omitting the field leaves it untouched. */
const secret = z.string().max(400).optional();

const schema = z.object({
  stripeEnabled: z.boolean().optional(),
  stripeSecretKey: secret,
  stripePriceStarter: z.string().max(200).optional(),
  stripePricePro: z.string().max(200).optional(),
  stripePriceAgency: z.string().max(200).optional(),
  stripeWebhookSecret: secret,
  storePaymentsEnabled: z.boolean().optional(),

  bkashEnabled: z.boolean().optional(),
  bkashNumber: z.string().max(40).optional(),
  bkashInstructions: z.string().max(1200).optional(),
  bkashUsdRate: z.preprocess(
    (value) => (typeof value === "string" ? parseRate(value) : value),
    z.number().min(0).max(100000).optional()
  ),

  metaEnabled: z.boolean().optional(),
  metaAppId: z.string().max(120).optional(),
  metaAppSecret: secret,
  metaVerifyToken: secret,
  metaGraphVersion: z
    .string()
    .regex(/^v\d+\.\d+$/, "Graph version looks like v21.0.")
    .optional(),
});

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const s = await getPlatformSettings();
  const connectedPages = await prisma.metaAccount.count();

  return NextResponse.json({
    stripe: {
      enabled: s?.stripeEnabled ?? false,
      secretKeySet: Boolean(s?.stripeSecretKey),
      priceStarter: s?.stripePriceStarter ?? "",
      pricePro: s?.stripePricePro ?? "",
      priceAgency: s?.stripePriceAgency ?? "",
      webhookSecretSet: Boolean(process.env.STRIPE_WEBHOOK_SECRET) || Boolean(s?.stripeWebhookSecret),
    },
    bkash: {
      enabled: s?.bkashEnabled ?? false,
      number: s?.bkashNumber ?? "",
      instructions: s?.bkashInstructions ?? "",
      usdRate: s?.bkashUsdRate ?? null,
    },
    meta: {
      enabled: s?.metaEnabled ?? false,
      appId: s?.metaAppId ?? "",
      appSecretSet: Boolean(s?.metaAppSecret),
      verifyTokenSet: Boolean(s?.metaVerifyToken),
      graphVersion: s?.metaGraphVersion ?? "v21.0",
      connectedPages,
    },
    email: { configured: isEmailConfigured() },
    urls: {
      metaOauthCallback: `${appUrl()}/api/meta/oauth/callback`,
      facebookLoginCallback: `${appUrl()}/api/account/facebook/callback`,
      metaWebhook: `${appUrl()}/api/webhooks/meta`,
      stripeWebhook: `${appUrl()}/api/webhooks/stripe`,
    },
    storePaymentsEnabled: s?.storePaymentsEnabled ?? false,
  });
}

export async function PUT(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid settings." },
      { status: 400 }
    );
  }
  const d = parsed.data;
  const existing = await getPlatformSettings();
  const data: Record<string, unknown> = {};

  if (d.stripeSecretKey !== undefined) {
    if (d.stripeSecretKey) {
      try {
        await stripeClient(d.stripeSecretKey).balance.retrieve();
      } catch {
        return NextResponse.json(
          { error: "Stripe rejected that secret key. Double-check it and try again." },
          { status: 400 }
        );
      }
      data.stripeSecretKey = encrypt(d.stripeSecretKey);
    } else {
      data.stripeSecretKey = null;
    }
  }

  if (d.metaAppSecret !== undefined) {
    data.metaAppSecret = d.metaAppSecret ? encrypt(d.metaAppSecret) : null;
  }
  if (d.metaVerifyToken !== undefined) {
    data.metaVerifyToken = d.metaVerifyToken ? encrypt(d.metaVerifyToken) : null;
  }
  if (d.stripeWebhookSecret !== undefined) {
    data.stripeWebhookSecret = d.stripeWebhookSecret ? encrypt(d.stripeWebhookSecret) : null;
  }

  for (const field of ["stripePriceStarter", "stripePricePro", "stripePriceAgency"] as const) {
    if (d[field] === undefined) continue;
    const id = normalizeStripePriceId(d[field]);
    if (id && !isStripePriceId(id)) {
      return NextResponse.json(
        {
          error:
            "Stripe price IDs start with price_ and come from Stripe Dashboard → Product. Do not enter 12, 26, or ১২.",
        },
        { status: 400 }
      );
    }
    data[field] = id || null;
  }

  for (const field of [
    "stripeEnabled",
    "bkashEnabled",
    "bkashNumber",
    "bkashInstructions",
    "bkashUsdRate",
    "metaEnabled",
    "metaAppId",
    "metaGraphVersion",
    "storePaymentsEnabled",
  ] as const) {
    if (d[field] !== undefined) data[field] = d[field];
  }

  // Page tokens are issued by a specific Meta app. Rotating the app kills every
  // stored token, so flag the pages instead of leaving them silently dead.
  const newAppId = typeof d.metaAppId === "string" ? d.metaAppId.trim() : undefined;
  const appIdChanged =
    newAppId !== undefined && Boolean(existing?.metaAppId) && newAppId !== existing?.metaAppId;

  try {
    await savePlatformSettings({ ...data, updatedByEmail: guard.user.email });
  } catch (error) {
    console.error("platform settings save", error);
    return NextResponse.json(
      { error: "Could not write platform settings. Check the database and try again." },
      { status: 500 }
    );
  }

  let flaggedPages = 0;
  if (appIdChanged) {
    const flagged = await prisma.metaAccount.updateMany({
      data: { needsReconnect: true, subscribed: false },
    });
    flaggedPages = flagged.count;
  }

  return NextResponse.json({ saved: true, flaggedPages });
}
