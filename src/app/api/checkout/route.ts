import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { creatorStripe } from "@/lib/stripe";
import { createBkashPayment, creatorBkash } from "@/lib/bkash";
import { fulfillOrder } from "@/lib/fulfillment";
import { appUrl, currencyToCode, toCents } from "@/lib/utils";

const schema = z.object({
  productId: z.string().min(1),
  customerName: z.string().min(2).max(80),
  customerEmail: z.string().email(),
  customerPhone: z.string().max(30).optional(),
  gateway: z.enum(["Stripe", "bKash"]),
  slotId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid checkout data." },
        { status: 400 }
      );
    }
    const d = parsed.data;

    const product = await prisma.product.findFirst({
      where: { id: d.productId, active: true },
      include: { user: true },
    });
    if (!product) {
      return NextResponse.json({ error: "Product is unavailable." }, { status: 404 });
    }

    if (product.type === "consultation") {
      if (!d.slotId) {
        return NextResponse.json({ error: "Please select a session slot." }, { status: 400 });
      }
      const slot = await prisma.consultationSlot.findFirst({
        where: { id: d.slotId, productId: product.id },
      });
      if (!slot || slot.booked || slot.startsAt.getTime() < Date.now()) {
        return NextResponse.json({ error: "That slot is no longer available." }, { status: 409 });
      }
    }

    const currency = currencyToCode(product.currency);
    const order = await prisma.order.create({
      data: {
        userId: product.userId,
        productId: product.id,
        customerName: d.customerName,
        customerEmail: d.customerEmail.toLowerCase(),
        customerPhone: d.customerPhone || null,
        amountCents: toCents(product.price),
        currency,
        pricePaid: `${product.currency}${product.price}`,
        gateway: product.price === 0 ? "Free" : d.gateway,
        status: "PENDING",
        slotId: product.type === "consultation" ? d.slotId : null,
      },
    });

    // Free products need no gateway round-trip.
    if (product.price === 0) {
      const { downloadUrl, meetingLink } = await fulfillOrder(order.id);
      return NextResponse.json({ mode: "complete", orderId: order.id, downloadUrl, meetingLink });
    }

    if (d.gateway === "Stripe") {
      const stripe = creatorStripe(product.user.stripeSecretKey);
      if (!stripe) {
        await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
        return NextResponse.json(
          { error: "This creator has not connected Stripe yet." },
          { status: 409 }
        );
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: order.customerEmail,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: order.amountCents,
              product_data: { name: product.title, description: product.description.slice(0, 300) },
            },
          },
        ],
        metadata: { orderId: order.id },
        success_url: `${appUrl()}/${product.user.username}?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl()}/${product.user.username}?checkout=cancel`,
      });

      await prisma.order.update({
        where: { id: order.id },
        data: { gatewayRef: session.id },
      });

      return NextResponse.json({ mode: "redirect", url: session.url, orderId: order.id });
    }

    const creds = creatorBkash(product.user);
    if (!creds) {
      await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
      return NextResponse.json(
        { error: "This creator has not connected bKash yet." },
        { status: 409 }
      );
    }
    if (currency !== "BDT") {
      await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
      return NextResponse.json(
        { error: "bKash only supports BDT (৳) priced products." },
        { status: 409 }
      );
    }

    const payment = await createBkashPayment(creds, {
      amount: product.price.toFixed(2),
      invoice: order.id,
      callbackUrl: `${appUrl()}/api/bkash/callback?orderId=${order.id}`,
      payerReference: d.customerPhone || order.customerEmail,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { gatewayRef: payment.paymentId },
    });

    return NextResponse.json({ mode: "redirect", url: payment.redirectUrl, orderId: order.id });
  } catch (error) {
    console.error("checkout", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Checkout failed." },
      { status: 500 }
    );
  }
}
