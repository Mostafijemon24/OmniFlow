import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { creatorStripe } from "@/lib/stripe";
import { fulfillOrder } from "@/lib/fulfillment";

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

  if (order.status === "PAID") {
    return NextResponse.json({
      status: "PAID",
      productType: order.product.type,
      downloadUrl: order.downloadToken
        ? `/api/download/${order.downloadToken.token}`
        : undefined,
      meetingLink: order.booking?.meetingLink ?? undefined,
      startsAt: order.booking?.startsAt ?? undefined,
    });
  }

  if (order.gateway !== "Stripe") {
    return NextResponse.json({ status: order.status });
  }

  const stripe = creatorStripe(order.user.stripeSecretKey);
  if (!stripe) return NextResponse.json({ error: "Stripe is not connected." }, { status: 409 });

  const session = await stripe.checkout.sessions.retrieve(sessionId || order.gatewayRef || "");
  if (session.payment_status !== "paid") {
    return NextResponse.json({ status: order.status, paymentStatus: session.payment_status });
  }

  const { order: fulfilled, downloadUrl, meetingLink } = await fulfillOrder(order.id);

  return NextResponse.json({
    status: "PAID",
    productType: fulfilled.product.type,
    downloadUrl:
      downloadUrl ??
      (fulfilled.downloadToken ? `/api/download/${fulfilled.downloadToken.token}` : undefined),
    meetingLink: meetingLink ?? fulfilled.booking?.meetingLink ?? undefined,
    startsAt: fulfilled.booking?.startsAt ?? undefined,
  });
}
