import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/guards";
import { encrypt } from "@/lib/crypto";
import { stripeClient } from "@/lib/stripe";
import { getPlatformSettings, savePlatformSettings } from "@/lib/platform-settings";
import { isEmailConfigured } from "@/lib/email";
import { appUrl } from "@/lib/utils";

/** "" clears a stored value; omitting the field leaves it untouched. */
const secret = z.string().max(400).optional();

const schema = z.object({
  stripeEnabled: z.boolean().optional(),
  stripeSecretKey: secret,
  stripePriceStarter: z.string().max(200).optional(),
  stripePricePro: z.string().max(200).optional(),
  stripePriceAgency: z.string().max(200).optional(),

  bkashEnabled: z.boolean().optional(),
  bkashNumber: z.string().max(40).optional(),
  bkashInstructions: z.string().max(1200).optional(),
  bkashUsdRate: z.coerce.number().min(0).max(100000).optional(),

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
      webhookSecretSet: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
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

  for (const field of [
    "stripeEnabled",
    "stripePriceStarter",
    "stripePricePro",
    "stripePriceAgency",
    "bkashEnabled",
    "bkashNumber",
    "bkashInstructions",
    "bkashUsdRate",
    "metaEnabled",
    "metaAppId",
    "metaGraphVersion",
  ] as const) {
    if (d[field] !== undefined) data[field] = d[field];
  }

  // Page tokens are issued by a specific Meta app. Rotating the app kills every
  // stored token, so flag the pages instead of leaving them silently dead.
  const newAppId = typeof d.metaAppId === "string" ? d.metaAppId.trim() : undefined;
  const appIdChanged =
    newAppId !== undefined && Boolean(existing?.metaAppId) && newAppId !== existing?.metaAppId;

  await savePlatformSettings({ ...data, updatedByEmail: guard.user.email });

  let flaggedPages = 0;
  if (appIdChanged) {
    const flagged = await prisma.metaAccount.updateMany({
      data: { needsReconnect: true, subscribed: false },
    });
    flaggedPages = flagged.count;
  }

  return NextResponse.json({ saved: true, flaggedPages });
}
