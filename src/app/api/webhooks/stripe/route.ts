import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripeForWebhooks } from "@/lib/stripe";
import { fulfillOrder } from "@/lib/fulfillment";
import { PLANS, PlanId } from "@/lib/plans";
import { platformStripeWebhookSecret } from "@/lib/platform-settings";

export const runtime = "nodejs";

/** Platform webhook: OmniFlow subscription lifecycle + store fulfilment. */
export async function POST(req: Request) {
  // Signature verification is local HMAC, so it works before the admin has
  // configured a Stripe API key. Only the signing secret is required.
  const stripe = stripeForWebhooks();
  const secret = await platformStripeWebhookSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Stripe webhook secret is not set. Add it in Platform Setup." },
      { status: 409 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    await prisma.webhookEvent.create({ data: { provider: "stripe", eventId: event.id } });
  } catch {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handle(event);
  } catch (error) {
    // Drop the dedupe row so Stripe's retry gets a real second attempt.
    await prisma.webhookEvent
      .delete({ where: { provider_eventId: { provider: "stripe", eventId: event.id } } })
      .catch(() => undefined);
    console.error("stripe webhook", event.type, error);
    return NextResponse.json({ error: "Webhook handling failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handle(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      const userId = session.metadata?.userId;
      const plan = session.metadata?.plan;

      if (orderId && session.payment_status === "paid") {
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (
          order &&
          order.gatewayRef === session.id &&
          session.amount_total === order.amountCents &&
          session.currency?.toUpperCase() === order.currency
        ) {
          await fulfillOrder(order.id);
        }
      }

      if (userId && plan && plan in PLANS && session.subscription) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            plan: plan as PlanId,
            planStatus: "active",
            stripeCustomerId: String(session.customer ?? ""),
            stripeSubscriptionId: String(session.subscription),
            // Stripe renews on its own, so the manual paid-up-to date no
            // longer governs this account.
            planPeriodEnd: null,
          },
        });
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const user = await prisma.user.findFirst({
        where: { stripeSubscriptionId: sub.id },
      });
      if (user) {
        const ended = sub.status === "canceled" || event.type === "customer.subscription.deleted";
        await prisma.user.update({
          where: { id: user.id },
          data: {
            planStatus: ended ? "canceled" : sub.status,
            ...(ended ? { plan: "starter" } : {}),
          },
        });
      }
      break;
    }

    default:
      break;
  }
}
