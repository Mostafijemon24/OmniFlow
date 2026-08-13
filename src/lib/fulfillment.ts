import { prisma } from "./prisma";
import { randomToken } from "./crypto";
import { appUrl } from "./utils";
import { deliveryEmailHtml, sendEmail } from "./email";

const DOWNLOAD_TTL_HOURS = Number(process.env.DOWNLOAD_TTL_HOURS || 72);

/**
 * Marks an order paid exactly once, then books the slot (consultations) or
 * issues a signed download link (digital files) and emails the buyer.
 */
export async function fulfillOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { product: true, user: true, downloadToken: true, booking: true },
  });
  if (!order) throw new Error("Order not found.");
  if (order.status === "PAID" && order.deliveredAt) {
    return { alreadyFulfilled: true, order };
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "PAID" },
  });

  await prisma.product.update({
    where: { id: order.productId },
    data: { salesCount: { increment: 1 } },
  });

  await prisma.funnelEvent.create({
    data: { userId: order.userId, type: "order_closed", metadata: order.id },
  });

  let downloadUrl: string | undefined;
  let expiresAt: Date | undefined;
  let meetingLink: string | undefined;
  let startsAt: Date | null = null;

  if (order.product.type === "consultation") {
    const slot = order.slotId
      ? await prisma.consultationSlot.findUnique({ where: { id: order.slotId } })
      : null;

    if (slot && !slot.booked) {
      await prisma.consultationSlot.update({
        where: { id: slot.id },
        data: { booked: true },
      });
    }

    startsAt = slot?.startsAt ?? new Date();
    meetingLink = order.product.meetingLink ?? undefined;

    if (!order.booking) {
      await prisma.booking.create({
        data: {
          orderId: order.id,
          userId: order.userId,
          productId: order.productId,
          slotId: slot?.id,
          startsAt,
          meetingLink,
          status: "CONFIRMED",
        },
      });
    }
  } else {
    expiresAt = new Date(Date.now() + DOWNLOAD_TTL_HOURS * 3600 * 1000);
    const token =
      order.downloadToken?.token ??
      (
        await prisma.downloadToken.create({
          data: { token: randomToken(24), orderId: order.id, expiresAt },
        })
      ).token;
    downloadUrl = `${appUrl()}/api/download/${token}`;
  }

  const result = await sendEmail({
    to: order.customerEmail,
    subject: `Your ${order.product.title} is ready`,
    html: deliveryEmailHtml({
      customerName: order.customerName,
      productTitle: order.product.title,
      creatorName: order.user.fullName,
      downloadUrl,
      meetingLink,
      startsAt,
      expiresAt,
    }),
  });

  await prisma.deliveryLog.create({
    data: {
      orderId: order.id,
      channel: "email",
      status: result.status,
      detail: result.detail,
    },
  });

  const fulfilled = await prisma.order.update({
    where: { id: order.id },
    data: { deliveredAt: new Date() },
    include: { product: true, downloadToken: true, booking: true },
  });

  return { alreadyFulfilled: false, order: fulfilled, downloadUrl, meetingLink };
}
