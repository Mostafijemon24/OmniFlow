import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/utils";
import { ALLOWED_IMAGE_MIME, MAX_UPLOAD_BYTES, saveFile } from "@/lib/storage";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const scope = String(form.get("scope") || "asset"); // "asset" (image) | "product" (private file)

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
    return NextResponse.json({ error: "Only image files are allowed here." }, { status: 415 });
  }

  const saved = await saveFile(scope === "asset" ? "public" : "private", file);

  return NextResponse.json({
    key: saved.key,
    name: saved.name,
    size: saved.size,
    mime: saved.mime,
    url: scope === "asset" ? `/api/files/${saved.key}` : null,
  });
}
