import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/utils";
import { monthStart, planOf } from "@/lib/plans";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const days = Math.min(Number(req.nextUrl.searchParams.get("days") || 30), 365);
  const since = new Date(Date.now() - days * 86400000);

  const [comments, dmsSent, dmsFailed, visits, paidOrders, latency, dmThisMonth, recentDms] =
    await Promise.all([
      prisma.funnelEvent.count({
        where: { userId: user.id, type: "comment_detected", createdAt: { gte: since } },
      }),
      prisma.dmLog.count({
        where: { userId: user.id, status: "sent", createdAt: { gte: since } },
      }),
      prisma.dmLog.count({
        where: { userId: user.id, status: { not: "sent" }, createdAt: { gte: since } },
      }),
      prisma.funnelEvent.count({
        where: { userId: user.id, type: "bio_visit", createdAt: { gte: since } },
      }),
      prisma.order.findMany({
        where: { userId: user.id, status: "PAID", createdAt: { gte: since } },
        select: { amountCents: true, currency: true },
      }),
      prisma.dmLog.aggregate({
        where: { userId: user.id, status: "sent", createdAt: { gte: since } },
        _avg: { latencyMs: true },
      }),
      prisma.dmLog.count({
        where: { userId: user.id, status: "sent", createdAt: { gte: monthStart() } },
      }),
      prisma.dmLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          platform: true,
          keyword: true,
          status: true,
          error: true,
          latencyMs: true,
          createdAt: true,
        },
      }),
    ]);

  const plan = planOf(user.plan);
  const revenueCents = paidOrders.reduce((sum, o) => sum + o.amountCents, 0);

  return NextResponse.json({
    days,
    commentsDetected: comments,
    autoDmsSent: dmsSent,
    autoDmsFailed: dmsFailed,
    bioVisits: visits,
    ordersClosed: paidOrders.length,
    revenueCents,
    avgDmLatencyMs: latency._avg.latencyMs ? Math.round(latency._avg.latencyMs) : null,
    commentToOrderRate: comments ? Number(((paidOrders.length / comments) * 100).toFixed(1)) : null,
    visitToOrderRate: visits ? Number(((paidOrders.length / visits) * 100).toFixed(1)) : null,
    dmQuota: {
      used: dmThisMonth,
      limit: Number.isFinite(plan.maxDmsPerMonth) ? plan.maxDmsPerMonth : null,
      planName: plan.name,
    },
    recentDms,
  });
}
