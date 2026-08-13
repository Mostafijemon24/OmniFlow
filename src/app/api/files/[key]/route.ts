import { NextResponse } from "next/server";
import { readFile } from "@/lib/storage";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

export async function GET(_req: Request, { params }: { params: { key: string } }) {
  try {
    const buffer = await readFile("public", params.key);
    const ext = params.key.slice(params.key.lastIndexOf(".")).toLowerCase();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
