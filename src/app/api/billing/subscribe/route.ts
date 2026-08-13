import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, appUrl } from "@/lib/utils";
import { platformStripe } from "@/lib/stripe";
import { planGateways, stripePriceIdFor } from "@/lib/platform-settings";
import { PLANS } from "@/lib/plans";

const schema = z.object({ plan: z.enum(["starter", "pro", "agency"]) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan." }, { status: 400 });

  const plan = PLANS[parsed.data.plan];

  // Availability is re-checked here rather than trusted from the page, so
  // hiding the button is never what enforces a switched-off gateway.
  const gateways = await planGateways(plan.id);
  if (!gateways.stripe) {
    return NextResponse.json(
      {
        error: "Card payments are not available right now. Please try again later.",
        code: "gateway_unavailable",
      },
      { status: 409 }
    );
  }

  const stripe = await platformStripe();
  const priceId = await stripePriceIdFor(plan.id);
  if (!stripe || !priceId) {
    return NextResponse.json(
      {
        error: "Card payments are not available right now. Please try again later.",
        code: "gateway_unavailable",
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
          data: {
            plan: plan.id,
            planStatus: updated.status === "active" ? "active" : updated.status,
            planPeriodEnd: null,
          },
        });
        return NextResponse.json({ switched: true, plan: plan.id });
      }
    } catch (error) {
      console.error("subscription switch", error);
    }
  }

  try {
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
      cancel_url: `${appUrl()}/dashboard/checkout?plan=${plan.id}&canceled=1`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    // A misconfigured price ID or a revoked key must not surface as a stack
    // trace to the creator.
    console.error("stripe checkout session", error);
    return NextResponse.json(
      { error: "Stripe could not start this checkout. The platform admin has been notified." },
      { status: 502 }
    );
  }
}
