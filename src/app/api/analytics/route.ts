import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/utils";
import { effectivePlanOf, monthStart } from "@/lib/plans";

const RANGES = [7, 30, 90];

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requested = Number(req.nextUrl.searchParams.get("days"));
  const days = RANGES.includes(requested) ? requested : 30;
  const since = new Date(Date.now() - days * 86400000);

  const [comments, dmsSent, dmsFailed, visits, revenue, latency, dmThisMonth, recentDms] =
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
      prisma.order.groupBy({
        by: ["currency"],
        where: { userId: user.id, status: "PAID", createdAt: { gte: since } },
        _sum: { amountCents: true },
        _count: { _all: true },
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

  const plan = effectivePlanOf(user);
  const ordersClosed = revenue.reduce((sum, row) => sum + row._count._all, 0);
  const rate = (denominator: number) =>
    denominator ? Number(((ordersClosed / denominator) * 100).toFixed(1)) : null;

  return NextResponse.json({
    days,
    commentsDetected: comments,
    autoDmsSent: dmsSent,
    autoDmsFailed: dmsFailed,
    bioVisits: visits,
    ordersClosed,
    // Currencies are never summed together: each gateway currency is reported
    // separately so the totals stay truthful.
    revenue: revenue
      .map((row) => ({ currency: row.currency, cents: row._sum.amountCents ?? 0 }))
      .sort((a, b) => b.cents - a.cents),
    avgDmLatencyMs: latency._avg.latencyMs ? Math.round(latency._avg.latencyMs) : null,
    commentToOrderRate: rate(comments),
    visitToOrderRate: rate(visits),
    dmQuota: {
      used: dmThisMonth,
      limit: Number.isFinite(plan.maxDmsPerMonth) ? plan.maxDmsPerMonth : null,
      planName: plan.name,
    },
    recentDms,
  });
}
