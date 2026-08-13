import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/utils";
import { planOf } from "@/lib/plans";

const schema = z
  .object({
    title: z.string().min(2).max(120),
    type: z.enum(["digital_file", "consultation"]),
    price: z.coerce.number().min(0).max(100000),
    currency: z.string().min(1).max(3).default("$"),
    badge: z.string().max(24).optional().or(z.literal("")),
    description: z.string().min(4).max(600),
    thumbnail: z.string().max(300).optional().or(z.literal("")),
    fileKey: z.string().max(120).optional(),
    fileName: z.string().max(200).optional(),
    fileSize: z.coerce.number().optional(),
    fileMime: z.string().max(120).optional(),
    meetingLink: z.string().url().optional().or(z.literal("")),
    durationMinutes: z.coerce.number().min(5).max(480).optional(),
  })
  .refine((d) => d.type !== "consultation" || Boolean(d.meetingLink), {
    message: "Consultations need a meeting link (Zoom, Meet, etc.).",
    path: ["meetingLink"],
  })
  .refine((d) => d.type !== "digital_file" || Boolean(d.fileKey), {
    message: "Upload the digital file buyers should receive.",
    path: ["fileKey"],
  });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const products = await prisma.product.findMany({
    where: { userId: user.id },
    include: { slots: { orderBy: { startsAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(products);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid product data." },
      { status: 400 }
    );
  }

  const plan = planOf(user.plan);
  const count = await prisma.product.count({ where: { userId: user.id } });
  if (count >= plan.maxProducts) {
    return NextResponse.json(
      { error: `Your ${plan.name} plan allows ${plan.maxProducts} products. Upgrade to add more.` },
      { status: 402 }
    );
  }

  const d = parsed.data;
  const product = await prisma.product.create({
    data: {
      userId: user.id,
      title: d.title,
      type: d.type,
      price: d.price,
      currency: d.currency,
      badge: d.badge || null,
      description: d.description,
      thumbnail: d.thumbnail || null,
      fileKey: d.type === "digital_file" ? d.fileKey : null,
      fileName: d.type === "digital_file" ? d.fileName : null,
      fileSize: d.type === "digital_file" ? d.fileSize : null,
      fileMime: d.type === "digital_file" ? d.fileMime : null,
      meetingLink: d.type === "consultation" ? d.meetingLink : null,
      durationMinutes: d.type === "consultation" ? (d.durationMinutes ?? 45) : null,
    },
    include: { slots: true },
  });

  return NextResponse.json(product, { status: 201 });
}
