import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/utils";

const schema = z.object({
  active: z.boolean().optional(),
  autoMessage: z.string().min(4).max(900).optional(),
  keyword: z.string().min(1).max(40).optional(),
  targetProductId: z.string().optional(),
  metaAccountId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid rule data." }, { status: 400 });

  const rule = await prisma.autoDMRule.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!rule) return NextResponse.json({ error: "Rule not found." }, { status: 404 });

  if (parsed.data.targetProductId) {
    const owned = await prisma.product.findFirst({
      where: { id: parsed.data.targetProductId, userId: user.id },
    });
    if (!owned) return NextResponse.json({ error: "Target product not found." }, { status: 404 });
  }

  const updated = await prisma.autoDMRule.update({
    where: { id: rule.id },
    data: {
      ...parsed.data,
      keyword: parsed.data.keyword?.trim().toUpperCase(),
    },
    include: {
      targetProduct: { select: { id: true, title: true, price: true, currency: true } },
      metaAccount: { select: { id: true, pageName: true, platform: true, subscribed: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rule = await prisma.autoDMRule.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!rule) return NextResponse.json({ error: "Rule not found." }, { status: 404 });

  await prisma.autoDMRule.delete({ where: { id: rule.id } });
  return NextResponse.json({ deleted: true });
}
