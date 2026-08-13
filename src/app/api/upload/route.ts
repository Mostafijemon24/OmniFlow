import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/utils";
import { ALLOWED_IMAGE_MIME, MAX_UPLOAD_BYTES, deleteFile, saveFile } from "@/lib/storage";

const SCOPES = ["asset", "product"] as const;
type Scope = (typeof SCOPES)[number];

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart upload." }, { status: 400 });
  }

  const file = form.get("file");
  const rawScope = String(form.get("scope") || "asset");
  if (!SCOPES.includes(rawScope as Scope)) {
    return NextResponse.json({ error: "Unknown upload scope." }, { status: 400 });
  }
  const scope = rawScope as Scope;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB limit.` },
      { status: 413 }
    );
  }
  if (scope === "asset" && !ALLOWED_IMAGE_MIME.includes(file.type)) {
    return NextResponse.json(
      { error: "Cover art must be a PNG, JPEG, WebP, or GIF image." },
      { status: 415 }
    );
  }

  const bucket = scope === "asset" ? "public" : "private";
  const saved = await saveFile(bucket, file);

  try {
    await prisma.upload.create({
      data: {
        userId: user.id,
        bucket,
        key: saved.key,
        name: saved.name,
        mime: saved.mime,
        size: saved.size,
      },
    });
  } catch (error) {
    await deleteFile(bucket, saved.key).catch(() => undefined);
    throw error;
  }

  return NextResponse.json({
    key: saved.key,
    name: saved.name,
    size: saved.size,
    mime: saved.mime,
    url: scope === "asset" ? `/api/files/${saved.key}` : null,
  });
}
