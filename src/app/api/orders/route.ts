import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/utils";

const STATUSES = ["PAID", "PENDING", "FAILED", "REFUNDED"];
const PAGE_SIZE = 200;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const requestedStatus = req.nextUrl.searchParams.get("status");
  const status = requestedStatus && STATUSES.includes(requestedStatus) ? requestedStatus : null;

  const where = {
    userId: user.id,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { customerName: { contains: q } },
            { customerEmail: { contains: q } },
            { product: { title: { contains: q } } },
          ],
        }
      : {}),
  };

  const [orders, matching, revenue] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        product: { select: { title: true, type: true } },
        downloadToken: { select: { token: true, expiresAt: true, downloadCount: true, maxDownloads: true } },
        booking: { select: { startsAt: true } },
        deliveryLogs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
    }),
    prisma.order.count({ where }),
    prisma.order.groupBy({
      by: ["currency"],
      where: { userId: user.id, status: "PAID" },
      _sum: { amountCents: true },
    }),
  ]);

  return NextResponse.json({
    total: matching,
    truncated: matching > orders.length,
    revenue: revenue
      .map((row) => ({ currency: row.currency, cents: row._sum.amountCents ?? 0 }))
      .sort((a, b) => b.cents - a.cents),
    orders: orders.map((order) => ({
      id: order.id,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      productTitle: order.product.title,
      productType: order.product.type,
      price: order.pricePaid,
      gateway: order.gateway,
      status: order.status,
      deliveredAt: order.deliveredAt,
      deliveryStatus: order.deliveryLogs[0]?.status ?? null,
      deliveryDetail: order.deliveryLogs[0]?.detail ?? null,
      downloadUrl: order.downloadToken ? `/api/download/${order.downloadToken.token}` : null,
      downloadExpiresAt: order.downloadToken?.expiresAt ?? null,
      downloadsLeft: order.downloadToken
        ? Math.max(0, order.downloadToken.maxDownloads - order.downloadToken.downloadCount)
        : null,
      bookingStartsAt: order.booking?.startsAt ?? null,
      createdAt: order.createdAt,
    })),
  });
}
