import { NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/utils";
import { encrypt } from "@/lib/crypto";

const schema = z.object({
  stripeSecretKey: z.string().min(10).optional().or(z.literal("")),
  bkashAppKey: z.string().optional().or(z.literal("")),
  bkashAppSecret: z.string().optional().or(z.literal("")),
  bkashUsername: z.string().optional().or(z.literal("")),
  bkashPassword: z.string().optional().or(z.literal("")),
  bkashSandbox: z.boolean().optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    stripeConnected: Boolean(user.stripeSecretKey),
    bkashConnected: Boolean(
      user.bkashAppKey && user.bkashAppSecret && user.bkashUsername && user.bkashPassword
    ),
    bkashSandbox: user.bkashSandbox,
    emailConfigured: Boolean(process.env.RESEND_API_KEY),
  });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment settings." }, { status: 400 });
  }
  const d = parsed.data;

  if (d.stripeSecretKey) {
    try {
      const stripe = new Stripe(d.stripeSecretKey, { apiVersion: "2024-06-20" });
      await stripe.balance.retrieve();
    } catch {
      return NextResponse.json(
        { error: "Stripe rejected that secret key. Double-check and try again." },
        { status: 400 }
      );
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(d.stripeSecretKey !== undefined
        ? { stripeSecretKey: d.stripeSecretKey ? encrypt(d.stripeSecretKey) : null }
        : {}),
      ...(d.bkashAppKey !== undefined
        ? { bkashAppKey: d.bkashAppKey ? encrypt(d.bkashAppKey) : null }
        : {}),
      ...(d.bkashAppSecret !== undefined
        ? { bkashAppSecret: d.bkashAppSecret ? encrypt(d.bkashAppSecret) : null }
        : {}),
      ...(d.bkashUsername !== undefined
        ? { bkashUsername: d.bkashUsername ? encrypt(d.bkashUsername) : null }
        : {}),
      ...(d.bkashPassword !== undefined
        ? { bkashPassword: d.bkashPassword ? encrypt(d.bkashPassword) : null }
        : {}),
      ...(d.bkashSandbox !== undefined ? { bkashSandbox: d.bkashSandbox } : {}),
    },
  });

  return NextResponse.json({ saved: true });
}
