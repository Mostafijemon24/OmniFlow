import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 60;

/** Real platform-wide numbers used on the marketing page. */
export async function GET() {
  const [creators, products, paidOrders, dmsSent, latency, comments] = await Promise.all([
    prisma.user.count(),
    prisma.product.count({ where: { active: true } }),
    prisma.order.findMany({ where: { status: "PAID" }, select: { amountCents: true } }),
    prisma.dmLog.count({ where: { status: "sent" } }),
    prisma.dmLog.aggregate({ where: { status: "sent" }, _avg: { latencyMs: true } }),
    prisma.funnelEvent.count({ where: { type: "comment_detected" } }),
  ]);

  return NextResponse.json({
    creators,
    products,
    ordersClosed: paidOrders.length,
    revenueCents: paidOrders.reduce((sum, o) => sum + o.amountCents, 0),
    autoDmsSent: dmsSent,
    avgDmLatencyMs: latency._avg.latencyMs ? Math.round(latency._avg.latencyMs) : null,
    commentToOrderRate: comments
      ? Number(((paidOrders.length / comments) * 100).toFixed(1))
      : null,
  });
}
