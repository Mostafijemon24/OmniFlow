import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, ownsAssetUrl, ownsUpload } from "@/lib/utils";
import { deleteFile } from "@/lib/storage";

const schema = z.object({
  title: z.string().min(2).max(120).optional(),
  price: z.coerce.number().min(0).max(100000).optional(),
  currency: z.string().min(1).max(3).optional(),
  description: z.string().min(4).max(600).optional(),
  badge: z.string().max(24).optional().or(z.literal("")),
  thumbnail: z.string().max(300).optional().or(z.literal("")),
  active: z.boolean().optional(),
  fileKey: z.string().max(120).optional(),
  fileName: z.string().max(200).optional(),
  fileSize: z.coerce.number().optional(),
  fileMime: z.string().max(120).optional(),
  meetingLink: z.string().url().optional().or(z.literal("")),
  durationMinutes: z.coerce.number().min(5).max(480).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid product data." },
      { status: 400 }
    );
  }

  const existing = await prisma.product.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!existing) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  const d = parsed.data;

  if (d.fileKey && d.fileKey !== existing.fileKey) {
    if (!(await ownsUpload(user.id, d.fileKey, "private"))) {
      return NextResponse.json({ error: "That deliverable is not yours." }, { status: 403 });
    }
    if (existing.fileKey) {
      await deleteFile("private", existing.fileKey).catch(() => undefined);
      await prisma.upload.deleteMany({ where: { key: existing.fileKey, userId: user.id } });
    }
  }
  if (d.thumbnail && !(await ownsAssetUrl(user.id, d.thumbnail))) {
    return NextResponse.json({ error: "Upload the cover image again." }, { status: 403 });
  }
  if (existing.type === "consultation" && d.meetingLink === "") {
    return NextResponse.json(
      { error: "Consultations need a meeting link (Zoom, Meet, etc.)." },
      { status: 400 }
    );
  }

  const updated = await prisma.product.update({
    where: { id: params.id },
    data: {
      ...d,
      badge: d.badge === "" ? null : d.badge,
      thumbnail: d.thumbnail === "" ? null : d.thumbnail,
      meetingLink: d.meetingLink === "" ? null : d.meetingLink,
    },
    include: { slots: { orderBy: { startsAt: "asc" } } },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.product.findFirst({
    where: { id: params.id, userId: user.id },
    include: { _count: { select: { orders: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  if (existing._count.orders > 0) {
    const archived = await prisma.product.update({
      where: { id: params.id },
      data: { active: false },
    });
    return NextResponse.json({
      archived: true,
      product: archived,
      message: "Product has paid orders, so it was archived instead of deleted.",
    });
  }

  if (existing.fileKey) {
    await deleteFile("private", existing.fileKey).catch(() => undefined);
    await prisma.upload.deleteMany({ where: { key: existing.fileKey, userId: user.id } });
  }
  await prisma.product.delete({ where: { id: params.id } });

  return NextResponse.json({ deleted: true });
}
