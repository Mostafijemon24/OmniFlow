import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Real platform-wide counters for the marketing page. Aggregate revenue is
 * deliberately not exposed here — it is per-creator business data.
 */
export async function GET() {
  const [creators, products, ordersClosed, dmsSent, latency, comments] = await Promise.all([
    prisma.user.count(),
    prisma.product.count({ where: { active: true } }),
    prisma.order.count({ where: { status: "PAID" } }),
    prisma.dmLog.count({ where: { status: "sent" } }),
    prisma.dmLog.aggregate({ where: { status: "sent" }, _avg: { latencyMs: true } }),
    prisma.funnelEvent.count({ where: { type: "comment_detected" } }),
  ]);

  return NextResponse.json(
    {
      creators,
      products,
      ordersClosed,
      autoDmsSent: dmsSent,
      avgDmLatencyMs: latency._avg.latencyMs ? Math.round(latency._avg.latencyMs) : null,
      commentToOrderRate: comments
        ? Number(((ordersClosed / comments) * 100).toFixed(1))
        : null,
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
