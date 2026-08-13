import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/utils";
import { PLANS } from "@/lib/plans";
import { bkashAmountCentsForUsd, planGateways } from "@/lib/platform-settings";
import { pruneRateLimits, rateLimit } from "@/lib/rate-limit";

/**
 * The amount is deliberately absent: it is derived from the plan the creator
 * chose, so a submitter cannot declare that $99 of Agency cost them 1 taka.
 */
const schema = z.object({
  plan: z.enum(["starter", "pro", "agency"]),
  trxId: z
    .string()
    .trim()
    .min(6, "A bKash transaction ID is at least 6 characters.")
    .max(40)
    .regex(/^[A-Za-z0-9]+$/, "A bKash transaction ID is letters and digits only."),
  senderNumber: z
    .string()
    .trim()
    .min(11, "Enter the full bKash number you sent from.")
    .max(20)
    .regex(/^[0-9+]+$/, "Enter the bKash number as digits."),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payments = await prisma.manualPayment.findMany({
    where: { userId: user.id, kind: "subscription" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      plan: true,
      trxId: true,
      amountCents: true,
      currency: true,
      status: true,
      reviewNote: true,
      reviewedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ payments });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  pruneRateLimits();
  const limit = rateLimit(`manual-payment:${user.id}`, 5, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many payment submissions. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid payment details." },
      { status: 400 }
    );
  }
  const { plan: planId, senderNumber } = parsed.data;
  const trxId = parsed.data.trxId.toUpperCase();
  const plan = PLANS[planId];

  // Re-checked server-side: a hidden button is never what enforces this.
  const gateways = await planGateways(planId);
  if (!gateways.bkash) {
    return NextResponse.json(
      {
        error: "bKash is not available right now. Please try again later.",
        code: "gateway_unavailable",
      },
      { status: 409 }
    );
  }

  const amountCents = await bkashAmountCentsForUsd(plan.priceUsd);
  if (!amountCents) {
    return NextResponse.json(
      { error: "bKash is not available right now.", code: "gateway_unavailable" },
      { status: 409 }
    );
  }

  const pending = await prisma.manualPayment.count({
    where: { userId: user.id, status: "PENDING" },
  });
  if (pending >= 3) {
    return NextResponse.json(
      { error: "You already have payments waiting for review. Please wait for those first." },
      { status: 409 }
    );
  }

  try {
    const payment = await prisma.manualPayment.create({
      data: {
        kind: "subscription",
        gateway: "bKash",
        userId: user.id,
        plan: planId,
        trxId,
        senderNumber,
        amountCents,
        currency: "BDT",
      },
    });

    return NextResponse.json(
      {
        id: payment.id,
        status: payment.status,
        amountCents: payment.amountCents,
        currency: payment.currency,
      },
      { status: 201 }
    );
  } catch (error) {
    // The unique index on trxId is what actually stops a transaction being
    // claimed twice, including by two requests racing each other.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "That transaction ID has already been submitted.", code: "duplicate_trx" },
        { status: 409 }
      );
    }
    console.error("manual payment", error);
    return NextResponse.json({ error: "Could not record that payment." }, { status: 500 });
  }
}
