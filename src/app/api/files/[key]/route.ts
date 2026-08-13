import { NextResponse } from "next/server";
import { readFile } from "@/lib/storage";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Public bucket only, so private deliverables are never reachable from here. */
export async function GET(_req: Request, { params }: { params: { key: string } }) {
  const ext = params.key.slice(params.key.lastIndexOf(".")).toLowerCase();
  if (!MIME[ext]) return NextResponse.json({ error: "File not found." }, { status: 404 });

  let buffer: Buffer;
  try {
    buffer = await readFile("public", params.key);
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": MIME[ext],
      "Content-Length": String(buffer.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
