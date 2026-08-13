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

/** Stripe has no BDT presentment currency, so ৳ products must go through bKash. */
const STRIPE_CURRENCIES = ["USD", "EUR", "GBP"];

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
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
    if (product.type === "digital_file" && !product.fileKey) {
      return NextResponse.json(
        { error: "This product has no deliverable attached yet." },
        { status: 409 }
      );
    }

    // The price always comes from the database. The gateway is validated before
    // an order row exists so unconfigured creators do not accumulate dead
    // orders in their CRM.
    const currency = currencyToCode(product.currency);
    const amountCents = toCents(product.price);
    const paid = amountCents > 0;

    let stripe: ReturnType<typeof creatorStripe> = null;
    let bkashCreds: ReturnType<typeof creatorBkash> = null;

    if (paid && d.gateway === "Stripe") {
      stripe = creatorStripe(product.user.stripeSecretKey);
      if (!stripe) {
        return NextResponse.json(
          { error: "This creator has not connected Stripe yet." },
          { status: 409 }
        );
      }
      if (!STRIPE_CURRENCIES.includes(currency)) {
        return NextResponse.json(
          { error: `Stripe cannot charge ${currency}. Please pay this product with bKash.` },
          { status: 409 }
        );
      }
    }

    if (paid && d.gateway === "bKash") {
      bkashCreds = creatorBkash(product.user);
      if (!bkashCreds) {
        return NextResponse.json(
          { error: "This creator has not connected bKash yet." },
          { status: 409 }
        );
      }
      if (currency !== "BDT") {
        return NextResponse.json(
          { error: "bKash only supports BDT (৳) priced products." },
          { status: 409 }
        );
      }
    }

    const order = await prisma.order.create({
      data: {
        userId: product.userId,
        productId: product.id,
        customerName: d.customerName,
        customerEmail: d.customerEmail.toLowerCase(),
        customerPhone: d.customerPhone || null,
        amountCents,
        currency,
        pricePaid: `${product.currency}${product.price}`,
        gateway: paid ? d.gateway : "Free",
        status: "PENDING",
        slotId: product.type === "consultation" ? d.slotId : null,
      },
    });

    // Free products need no gateway round-trip.
    if (!paid) {
      const { downloadUrl, meetingLink } = await fulfillOrder(order.id);
      return NextResponse.json({ mode: "complete", orderId: order.id, downloadUrl, meetingLink });
    }

    if (stripe) {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: order.customerEmail,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: amountCents,
              product_data: {
                name: product.title,
                description: product.description.slice(0, 300),
              },
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

    const payment = await createBkashPayment(bkashCreds!, {
      amount: (amountCents / 100).toFixed(2),
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
    return NextResponse.json({ error: "Checkout failed. Please try again." }, { status: 500 });
  }
}
