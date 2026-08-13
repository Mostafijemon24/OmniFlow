import { prisma } from "./prisma";
import { randomToken } from "./crypto";
import { appUrl } from "./utils";
import { deliveryEmailHtml, sendEmail } from "./email";

const DOWNLOAD_TTL_HOURS = Math.max(1, Number(process.env.DOWNLOAD_TTL_HOURS) || 72);

export function downloadExpiry() {
  return new Date(Date.now() + DOWNLOAD_TTL_HOURS * 3600 * 1000);
}

/**
 * Marks an order paid exactly once, then books the slot (consultations) or
 * issues a signed download link (digital files) and emails the buyer.
 *
 * The `deliveredAt` column is the idempotency key: claiming it with a
 * conditional update means the checkout confirm endpoint and the Stripe webhook
 * can both call this concurrently without double-fulfilling.
 */
export async function fulfillOrder(orderId: string) {
  const claim = await prisma.order.updateMany({
    where: { id: orderId, deliveredAt: null },
    data: { status: "PAID", deliveredAt: new Date() },
  });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { product: true, user: true, downloadToken: true, booking: true },
  });
  if (!order) throw new Error("Order not found.");

  if (claim.count === 0) {
    return {
      alreadyFulfilled: true,
      order,
      downloadUrl: order.downloadToken
        ? `${appUrl()}/api/download/${order.downloadToken.token}`
        : undefined,
      meetingLink: order.booking?.meetingLink ?? undefined,
    };
  }

  await prisma.$transaction([
    prisma.product.update({
      where: { id: order.productId },
      data: { salesCount: { increment: 1 } },
    }),
    prisma.funnelEvent.create({
      data: { userId: order.userId, type: "order_closed", metadata: order.id },
    }),
  ]);

  let downloadUrl: string | undefined;
  let expiresAt: Date | undefined;
  let meetingLink: string | undefined;
  let startsAt: Date | null = null;
  let slotConflict = false;

  if (order.product.type === "consultation") {
    const slot = order.slotId
      ? await prisma.consultationSlot.findUnique({ where: { id: order.slotId } })
      : null;

    let slotId: string | null = null;
    if (slot) {
      const booked = await prisma.consultationSlot.updateMany({
        where: { id: slot.id, booked: false },
        data: { booked: true },
      });
      if (booked.count === 1) {
        slotId = slot.id;
      } else {
        slotConflict = true;
      }
    }

    startsAt = slot?.startsAt ?? new Date();
    meetingLink = order.product.meetingLink ?? undefined;

    if (!order.booking) {
      await prisma.booking.create({
        data: {
          orderId: order.id,
          userId: order.userId,
          productId: order.productId,
          slotId,
          startsAt,
          meetingLink,
          status: "CONFIRMED",
        },
      });
    }
  } else {
    expiresAt = downloadExpiry();
    const token = await prisma.downloadToken.upsert({
      where: { orderId: order.id },
      create: { token: randomToken(24), orderId: order.id, expiresAt },
      update: { expiresAt },
    });
    downloadUrl = `${appUrl()}/api/download/${token.token}`;
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

  if (slotConflict) {
    await prisma.deliveryLog.create({
      data: {
        orderId: order.id,
        channel: "email",
        status: "failed",
        detail:
          "The chosen slot was taken while payment was in flight. Confirm a new time with the buyer.",
      },
    });
  }

  const fulfilled = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { product: true, downloadToken: true, booking: true },
  });

  return { alreadyFulfilled: false, order: fulfilled, downloadUrl, meetingLink };
}
