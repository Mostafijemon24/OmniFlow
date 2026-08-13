import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/utils";

const schema = z.object({ startsAt: z.string().datetime() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a valid date and time." }, { status: 400 });
  }

  const product = await prisma.product.findFirst({
    where: { id: params.id, userId: user.id, type: "consultation" },
  });
  if (!product) {
    return NextResponse.json({ error: "Consultation product not found." }, { status: 404 });
  }

  const startsAt = new Date(parsed.data.startsAt);
  if (startsAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Slot must be in the future." }, { status: 400 });
  }

  const duplicate = await prisma.consultationSlot.findFirst({
    where: { productId: product.id, startsAt },
  });
  if (duplicate) {
    return NextResponse.json({ error: "That slot already exists." }, { status: 409 });
  }

  const slot = await prisma.consultationSlot.create({
    data: { productId: product.id, startsAt },
  });
  return NextResponse.json(slot, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const slotId = new URL(req.url).searchParams.get("slotId");
  if (!slotId) return NextResponse.json({ error: "slotId is required." }, { status: 400 });

  const slot = await prisma.consultationSlot.findFirst({
    where: { id: slotId, product: { id: params.id, userId: user.id } },
  });
  if (!slot) return NextResponse.json({ error: "Slot not found." }, { status: 404 });
  if (slot.booked) {
    return NextResponse.json({ error: "Booked slots cannot be removed." }, { status: 409 });
  }

  await prisma.consultationSlot.delete({ where: { id: slot.id } });
  return NextResponse.json({ deleted: true });
}
