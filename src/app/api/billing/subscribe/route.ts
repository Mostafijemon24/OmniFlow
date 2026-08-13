import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, appUrl } from "@/lib/utils";
import { platformStripe } from "@/lib/stripe";
import { PLANS } from "@/lib/plans";

const schema = z.object({ plan: z.enum(["starter", "pro", "agency"]) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan." }, { status: 400 });

  const plan = PLANS[parsed.data.plan];
  const stripe = platformStripe();
  const priceId = process.env[plan.stripePriceEnv];

  if (!stripe || !priceId) {
    return NextResponse.json(
      {
        error: `Billing is not configured. Set STRIPE_SECRET_KEY and ${plan.stripePriceEnv} to enable ${plan.name} subscriptions.`,
      },
      { status: 409 }
    );
  }

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.fullName,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { userId: user.id, plan: plan.id },
    subscription_data: { metadata: { userId: user.id, plan: plan.id } },
    success_url: `${appUrl()}/dashboard/billing?upgraded=${plan.id}`,
    cancel_url: `${appUrl()}/dashboard/billing?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}
