import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";

export function slugifyHandle(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({ where: { id: session.user.id } });
}

/** `/api/files/<key>` → `<key>`, for values that are stored as public URLs. */
export function assetUrlToKey(url: string) {
  const match = /^\/api\/files\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,127})$/.exec(url);
  return match ? match[1] : null;
}

export async function ownsUpload(userId: string, key: string, bucket: "public" | "private") {
  const upload = await prisma.upload.findUnique({ where: { key } });
  return Boolean(upload && upload.userId === userId && upload.bucket === bucket);
}

/** Rejects a public asset URL that is not one of this creator's own uploads. */
export async function ownsAssetUrl(userId: string, url: string) {
  const key = assetUrlToKey(url);
  if (!key) return false;
  return ownsUpload(userId, key, "public");
}

export function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function storeUrl(username: string, productId?: string) {
  const base = `${appUrl()}/${username}`;
  return productId ? `${base}?prod=${productId}` : base;
}

export function currencyToCode(symbol: string) {
  const map: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "৳": "BDT" };
  return map[symbol] || "USD";
}

export function toCents(amount: number) {
  return Math.round(amount * 100);
}

export { initialsAvatar } from "./format";
