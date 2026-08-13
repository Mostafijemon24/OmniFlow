import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFile } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const record = await prisma.downloadToken.findUnique({
    where: { token: params.token },
    include: { order: { include: { product: true } } },
  });

  if (!record) {
    return NextResponse.json({ error: "Invalid download link." }, { status: 404 });
  }
  if (record.order.status !== "PAID") {
    return NextResponse.json({ error: "This order is not paid." }, { status: 402 });
  }
  if (record.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "This download link has expired." }, { status: 410 });
  }

  const product = record.order.product;
  if (!product.fileKey) {
    return NextResponse.json(
      { error: "The creator has not attached a file to this product yet." },
      { status: 409 }
    );
  }

  // Claim one download before streaming so concurrent requests cannot exceed
  // the limit.
  const claim = await prisma.downloadToken.updateMany({
    where: {
      id: record.id,
      downloadCount: { lt: record.maxDownloads },
      expiresAt: { gt: new Date() },
    },
    data: { downloadCount: { increment: 1 } },
  });
  if (claim.count === 0) {
    return NextResponse.json({ error: "Download limit reached." }, { status: 429 });
  }

  let buffer: Buffer;
  try {
    buffer = await readFile("private", product.fileKey);
  } catch {
    await prisma.downloadToken.update({
      where: { id: record.id },
      data: { downloadCount: { decrement: 1 } },
    });
    return NextResponse.json({ error: "Stored file is missing." }, { status: 404 });
  }

  const filename =
    (product.fileName || `${product.title}.bin`).replace(/[^\w .()\-]+/g, "_").slice(0, 120) ||
    "download.bin";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": product.fileMime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
