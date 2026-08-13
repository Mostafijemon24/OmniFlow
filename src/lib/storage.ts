import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export type Bucket = "public" | "private";

function root() {
  return process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR)
    : path.join(process.cwd(), "storage");
}

function bucketDir(bucket: Bucket) {
  return path.join(root(), bucket);
}

function assertSafeKey(key: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(key)) throw new Error("Invalid storage key.");
}

export async function saveFile(
  bucket: Bucket,
  file: File
): Promise<{ key: string; size: number; mime: string; name: string }> {
  const dir = bucketDir(bucket);
  await fs.mkdir(dir, { recursive: true });

  const ext = path.extname(file.name).slice(0, 12).replace(/[^a-zA-Z0-9.]/g, "");
  const key = `${crypto.randomUUID()}${ext}`;
  assertSafeKey(key);

  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, key), buffer);

  return {
    key,
    size: buffer.byteLength,
    mime: file.type || "application/octet-stream",
    name: file.name,
  };
}

export async function readFile(bucket: Bucket, key: string) {
  assertSafeKey(key);
  return fs.readFile(path.join(bucketDir(bucket), key));
}

export async function deleteFile(bucket: Bucket, key: string) {
  assertSafeKey(key);
  await fs.rm(path.join(bucketDir(bucket), key), { force: true });
}

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 50) * 1024 * 1024;

export const ALLOWED_IMAGE_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];
