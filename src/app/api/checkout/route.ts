import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { storeGateways } from "@/lib/platform-settings";
import { fulfillOrder } from "@/lib/fulfillment";
import { currencyToCode, toCents } from "@/lib/utils";

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

    // The price always comes from the database, and the gateway is resolved
    // server-side, so hiding a button in the UI is never what enforces this.
    const currency = currencyToCode(product.currency);
    const amountCents = toCents(product.price);

    if (amountCents > 0) {
      const gateways = await storeGateways(currency);
      const usable = d.gateway === "Stripe" ? gateways.stripe : gateways.bkash;
      if (!usable) {
        return NextResponse.json(
          { error: "This product cannot be purchased right now.", code: "gateway_unavailable" },
          { status: 409 }
        );
      }
      // Reachable only if storePaymentsEnabled is switched on in the database
      // ahead of the store payment flow being built. Refusing is better than
      // opening an order that nothing can ever settle.
      console.error("checkout: store payments are switched on but not implemented");
      return NextResponse.json(
        { error: "This product cannot be purchased right now.", code: "gateway_unavailable" },
        { status: 409 }
      );
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
        gateway: "Free",
        status: "PENDING",
        slotId: product.type === "consultation" ? d.slotId : null,
      },
    });

    const { downloadUrl, meetingLink } = await fulfillOrder(order.id);
    return NextResponse.json({ mode: "complete", orderId: order.id, downloadUrl, meetingLink });
  } catch (error) {
    console.error("checkout", error);
    return NextResponse.json({ error: "Checkout failed. Please try again." }, { status: 500 });
  }
}
