import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { creatorBkash, executeBkashPayment } from "@/lib/bkash";
import { fulfillOrder } from "@/lib/fulfillment";
import { appUrl } from "@/lib/utils";

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

  if (status !== "success" || !paymentId) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    return NextResponse.redirect(`${store}?checkout=cancel`);
  }

  const creds = creatorBkash(order.user);
  if (!creds) return NextResponse.redirect(`${store}?checkout=error`);

  const result = await executeBkashPayment(creds, paymentId);
  if (!result.completed) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    return NextResponse.redirect(`${store}?checkout=cancel`);
  }

  await fulfillOrder(order.id);
  return NextResponse.redirect(`${store}?order=${order.id}`);
}
