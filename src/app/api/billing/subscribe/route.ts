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

  const parsed = schema.safeParse(await req.json().catch(() => null));
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
  if (user.plan === plan.id && user.planStatus === "active") {
    return NextResponse.json({ error: `${plan.name} is already active.` }, { status: 409 });
  }

  // Switching plans must move the existing subscription rather than opening a
  // second Checkout session, which would bill the creator twice.
  if (user.stripeSubscriptionId) {
    try {
      const existing = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      if (existing.status === "active" || existing.status === "trialing") {
        const updated = await stripe.subscriptions.update(existing.id, {
          items: [{ id: existing.items.data[0].id, price: priceId }],
          proration_behavior: "create_prorations",
          metadata: { userId: user.id, plan: plan.id },
        });
        await prisma.user.update({
          where: { id: user.id },
          data: { plan: plan.id, planStatus: updated.status === "active" ? "active" : updated.status },
        });
        return NextResponse.json({ switched: true, plan: plan.id });
      }
    } catch (error) {
      console.error("subscription switch", error);
    }
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
