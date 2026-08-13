import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const status = req.nextUrl.searchParams.get("status");

  const orders = await prisma.order.findMany({
    where: {
      userId: user.id,
      ...(status && status !== "ALL" ? { status } : {}),
      ...(q
        ? {
            OR: [
              { customerName: { contains: q } },
              { customerEmail: { contains: q } },
              { product: { title: { contains: q } } },
            ],
          }
        : {}),
    },
    include: {
      product: { select: { title: true, type: true } },
      downloadToken: true,
      booking: true,
      deliveryLogs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const revenueCents = orders
    .filter((o) => o.status === "PAID")
    .reduce((sum, o) => sum + o.amountCents, 0);

  return NextResponse.json({
    revenueCents,
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
      bookingStartsAt: order.booking?.startsAt ?? null,
      createdAt: order.createdAt,
    })),
  });
}
