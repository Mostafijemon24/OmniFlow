import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { creatorStripe } from "@/lib/stripe";
import { fulfillOrder } from "@/lib/fulfillment";
import { safeEqual } from "@/lib/crypto";

function delivery(order: {
  product: { type: string };
  downloadToken: { token: string } | null;
  booking: { meetingLink: string | null; startsAt: Date } | null;
}) {
  return {
    status: "PAID" as const,
    productType: order.product.type,
    downloadUrl: order.downloadToken ? `/api/download/${order.downloadToken.token}` : undefined,
    meetingLink: order.booking?.meetingLink ?? undefined,
    startsAt: order.booking?.startsAt ?? undefined,
  };
}

/**
 * Verifies a Stripe Checkout session directly with Stripe before fulfilling,
 * so a redirect alone can never mark an order paid.
 */
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!orderId) return NextResponse.json({ error: "orderId is required." }, { status: 400 });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true, product: true, downloadToken: true, booking: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  if (order.status === "PAID" && order.deliveredAt) {
    return NextResponse.json(delivery(order));
  }

  if (order.gateway !== "Stripe") {
    return NextResponse.json({ status: order.status });
  }
  if (!order.gatewayRef) {
    return NextResponse.json({ status: order.status });
  }

  // The session id in the URL is attacker-controllable, so it is only accepted
  // when it is the session this order actually created. Without that check a
  // buyer could replay any paid session id to unlock a different order.
  if (sessionId && !safeEqual(sessionId, order.gatewayRef)) {
    return NextResponse.json({ error: "This checkout session does not belong to the order." }, {
      status: 409,
    });
  }

  const stripe = creatorStripe(order.user.stripeSecretKey);
  if (!stripe) return NextResponse.json({ error: "Stripe is not connected." }, { status: 409 });

  const session = await stripe.checkout.sessions.retrieve(order.gatewayRef);

  if (session.payment_status !== "paid") {
    return NextResponse.json({ status: order.status, paymentStatus: session.payment_status });
  }
  if (session.metadata?.orderId !== order.id) {
    return NextResponse.json({ error: "Checkout session mismatch." }, { status: 409 });
  }
  if (
    session.amount_total !== order.amountCents ||
    session.currency?.toUpperCase() !== order.currency
  ) {
    return NextResponse.json(
      { error: "The amount captured does not match this order." },
      { status: 409 }
    );
  }

  const { order: fulfilled } = await fulfillOrder(order.id);

  return NextResponse.json(delivery(fulfilled));
}
