import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/guards";
import { planNotice } from "@/lib/subscriptions";

const STATUSES = ["PENDING", "APPROVED", "REJECTED"];

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const requested = req.nextUrl.searchParams.get("status") ?? "PENDING";
  const status = STATUSES.includes(requested) ? requested : "PENDING";

  const [payments, pendingCount] = await Promise.all([
    prisma.manualPayment.findMany({
      where: { status },
      orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            username: true,
            plan: true,
            planStatus: true,
            planPeriodEnd: true,
            stripeSubscriptionId: true,
          },
        },
      },
    }),
    prisma.manualPayment.count({ where: { status: "PENDING" } }),
  ]);

  return NextResponse.json({
    status,
    pendingCount,
    payments: payments.map((p) => ({
      id: p.id,
      plan: p.plan,
      trxId: p.trxId,
      senderNumber: p.senderNumber,
      amountCents: p.amountCents,
      currency: p.currency,
      status: p.status,
      reviewNote: p.reviewNote,
      reviewedBy: p.reviewedBy,
      reviewedAt: p.reviewedAt,
      createdAt: p.createdAt,
      user: p.user && {
        email: p.user.email,
        fullName: p.user.fullName,
        username: p.user.username,
        plan: p.user.plan,
        planStatus: p.user.planStatus,
        planPeriodEnd: p.user.planPeriodEnd,
        // Lets the admin see who is lapsing and chase the renewal.
        notice: planNotice(p.user),
      },
    })),
  });
}
