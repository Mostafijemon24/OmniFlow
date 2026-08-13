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
