import { NextResponse } from "next/server";
import { z } from "zod";
import { isUniqueViolation, prisma } from "@/lib/prisma";
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

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid rule data." }, { status: 400 });

  const rule = await prisma.autoDMRule.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!rule) return NextResponse.json({ error: "Rule not found." }, { status: 404 });

  const d = parsed.data;

  if (d.targetProductId) {
    const owned = await prisma.product.findFirst({
      where: { id: d.targetProductId, userId: user.id },
    });
    if (!owned) return NextResponse.json({ error: "Target product not found." }, { status: 404 });
  }
  if (d.metaAccountId) {
    const owned = await prisma.metaAccount.findFirst({
      where: { id: d.metaAccountId, userId: user.id },
    });
    if (!owned) {
      return NextResponse.json({ error: "Connected account not found." }, { status: 404 });
    }
  }

  const keyword = d.keyword?.trim().toLocaleUpperCase();
  if (d.keyword !== undefined && !keyword) {
    return NextResponse.json({ error: "Keyword cannot be blank." }, { status: 400 });
  }

  try {
    const updated = await prisma.autoDMRule.update({
      where: { id: rule.id },
      data: { ...d, keyword },
      include: {
        targetProduct: { select: { id: true, title: true, price: true, currency: true } },
        metaAccount: { select: { id: true, pageName: true, platform: true, subscribed: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: `Keyword ${keyword} is already mapped on ${rule.platform}.` },
        { status: 409 }
      );
    }
    throw error;
  }
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
