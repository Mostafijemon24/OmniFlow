import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, appUrl } from "@/lib/utils";
import { deliveryEmailHtml, sendEmail } from "@/lib/email";
import { downloadExpiry } from "@/lib/fulfillment";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const order = await prisma.order.findFirst({
    where: { id: params.id, userId: user.id },
    include: { product: true, downloadToken: true, booking: true, user: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.status !== "PAID") {
    return NextResponse.json({ error: "Only paid orders can be delivered." }, { status: 409 });
  }

  // The same token row is reused so a re-send can never mint extra download
  // capacity; only its expiry window is renewed.
  let token = order.downloadToken;
  if (token && token.expiresAt.getTime() < Date.now()) {
    token = await prisma.downloadToken.update({
      where: { id: token.id },
      data: { expiresAt: downloadExpiry() },
    });
  }

  const result = await sendEmail({
    to: order.customerEmail,
    subject: `Your ${order.product.title} is ready`,
    html: deliveryEmailHtml({
      customerName: order.customerName,
      productTitle: order.product.title,
      creatorName: order.user.fullName,
      downloadUrl: token ? `${appUrl()}/api/download/${token.token}` : undefined,
      expiresAt: token?.expiresAt,
      meetingLink: order.booking?.meetingLink ?? undefined,
      startsAt: order.booking?.startsAt ?? null,
    }),
  }).catch((error) => ({
    ok: false as const,
    status: "failed" as const,
    detail: error instanceof Error ? error.message.slice(0, 500) : "Email transport error.",
  }));

  await prisma.deliveryLog.create({
    data: {
      orderId: order.id,
      channel: "email",
      status: result.status,
      detail: result.detail,
    },
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          result.status === "unconfigured"
            ? "Email is not configured. Set RESEND_API_KEY to send delivery emails."
            : result.detail || "Email delivery failed.",
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ sent: true });
}
