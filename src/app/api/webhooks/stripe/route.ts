import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { platformStripe } from "@/lib/stripe";
import { fulfillOrder } from "@/lib/fulfillment";

/** Platform webhook: OmniFlow subscription lifecycle + optional store fulfilment. */
export async function POST(req: Request) {
  const stripe = platformStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 409 });
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

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      const userId = session.metadata?.userId;
      const plan = session.metadata?.plan;

      if (orderId && session.payment_status === "paid") {
        await fulfillOrder(orderId).catch((e) => console.error("fulfill", e));
      }

      if (userId && plan && session.subscription) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            plan,
            planStatus: "active",
            stripeCustomerId: String(session.customer ?? ""),
            stripeSubscriptionId: String(session.subscription),
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
        await prisma.user.update({
          where: { id: user.id },
          data: {
            planStatus: sub.status === "active" ? "active" : sub.status,
            ...(sub.status === "canceled" ? { plan: "starter" } : {}),
          },
        });
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
