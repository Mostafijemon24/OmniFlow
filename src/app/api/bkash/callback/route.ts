import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { creatorBkash, executeBkashPayment } from "@/lib/bkash";
import { fulfillOrder } from "@/lib/fulfillment";
import { appUrl, toCents } from "@/lib/utils";
import { safeEqual } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");
  const paymentId = req.nextUrl.searchParams.get("paymentID");
  const status = req.nextUrl.searchParams.get("status");

  if (!orderId) return NextResponse.json({ error: "Missing orderId." }, { status: 400 });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const store = `${appUrl()}/${order.user.username}`;

  if (order.status === "PAID") {
    return NextResponse.redirect(`${store}?order=${order.id}`);
  }
  // Every query parameter here is attacker-controllable, so nothing is trusted
  // beyond identifying the order: the payment id must be the one this order
  // created, and the outcome comes from bKash itself.
  if (order.status !== "PENDING" || order.gateway !== "bKash" || !order.gatewayRef) {
    return NextResponse.redirect(`${store}?checkout=error`);
  }
  if (!paymentId || !safeEqual(paymentId, order.gatewayRef)) {
    return NextResponse.redirect(`${store}?checkout=error`);
  }

  if (status !== "success") {
    await prisma.order.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { status: "FAILED" },
    });
    return NextResponse.redirect(`${store}?checkout=cancel`);
  }

  const creds = creatorBkash(order.user);
  if (!creds) return NextResponse.redirect(`${store}?checkout=error`);

  let result: Awaited<ReturnType<typeof executeBkashPayment>>;
  try {
    result = await executeBkashPayment(creds, order.gatewayRef);
  } catch {
    return NextResponse.redirect(`${store}?checkout=error`);
  }

  const amountMatches =
    result.amount !== undefined &&
    toCents(Number(result.amount)) === order.amountCents &&
    (result.currency ?? "BDT").toUpperCase() === order.currency;

  if (!result.completed || !amountMatches) {
    await prisma.order.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { status: "FAILED" },
    });
    return NextResponse.redirect(`${store}?checkout=cancel`);
  }

  await fulfillOrder(order.id);
  return NextResponse.redirect(`${store}?order=${order.id}`);
}
