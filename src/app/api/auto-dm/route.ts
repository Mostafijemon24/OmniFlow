import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/utils";

const schema = z.object({
  platform: z.enum(["facebook", "instagram"]),
  keyword: z.string().min(1).max(40),
  targetProductId: z.string().min(1),
  autoMessage: z.string().min(4).max(900),
  metaAccountId: z.string().optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rules = await prisma.autoDMRule.findMany({
    where: { userId: user.id },
    include: {
      targetProduct: { select: { id: true, title: true, price: true, currency: true } },
      metaAccount: { select: { id: true, pageName: true, platform: true, subscribed: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rules);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid Auto-DM rule." },
      { status: 400 }
    );
  }
  const d = parsed.data;
  const keyword = d.keyword.trim().toUpperCase();

  const product = await prisma.product.findFirst({
    where: { id: d.targetProductId, userId: user.id },
  });
  if (!product) {
    return NextResponse.json({ error: "Target product not found." }, { status: 404 });
  }

  const clash = await prisma.autoDMRule.findFirst({
    where: { userId: user.id, platform: d.platform, keyword },
  });
  if (clash) {
    return NextResponse.json(
      { error: `Keyword ${keyword} is already mapped on ${d.platform}.` },
      { status: 409 }
    );
  }

  if (d.metaAccountId) {
    const owned = await prisma.metaAccount.findFirst({
      where: { id: d.metaAccountId, userId: user.id },
    });
    if (!owned) {
      return NextResponse.json({ error: "Connected account not found." }, { status: 404 });
    }
  }

  const rule = await prisma.autoDMRule.create({
    data: {
      userId: user.id,
      platform: d.platform,
      keyword,
      targetProductId: d.targetProductId,
      autoMessage: d.autoMessage,
      metaAccountId: d.metaAccountId || null,
    },
    include: {
      targetProduct: { select: { id: true, title: true, price: true, currency: true } },
      metaAccount: { select: { id: true, pageName: true, platform: true, subscribed: true } },
    },
  });

  return NextResponse.json(rule, { status: 201 });
}
