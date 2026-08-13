import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { PublicStore } from "@/components/store/public-store";
import { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

const RESERVED = new Set(["dashboard", "onboarding", "api", "auth", "favicon.ico"]);

export async function generateMetadata({ params }: { params: { username: string } }) {
  const user = await prisma.user.findUnique({
    where: { username: params.username },
    select: { fullName: true, bio: true, headline: true },
  });
  if (!user) return { title: "Store not found" };
  return {
    title: `${user.fullName} | OmniFlow Store`,
    description: user.bio || user.headline || "OmniFlow creator storefront",
  };
}

export default async function PublicBioPage({ params }: { params: { username: string } }) {
  if (RESERVED.has(params.username)) notFound();

  const user = await prisma.user.findUnique({
    where: { username: params.username },
    include: {
      products: {
        where: { active: true },
        include: { slots: { where: { booked: false }, orderBy: { startsAt: "asc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!user) notFound();

  await prisma.funnelEvent.create({
    data: { userId: user.id, type: "bio_visit", metadata: params.username },
  });

  const products: Product[] = user.products.map((p) => ({
    id: p.id,
    title: p.title,
    type: p.type as Product["type"],
    price: p.price,
    currency: p.currency,
    badge: p.badge,
    description: p.description,
    thumbnail: p.thumbnail,
    active: p.active,
    fileKey: null,
    fileName: null,
    fileSize: null,
    fileMime: null,
    meetingLink: null,
    durationMinutes: p.durationMinutes,
    salesCount: p.salesCount,
    slots: p.slots.map((s) => ({
      id: s.id,
      startsAt: s.startsAt.toISOString(),
      booked: s.booked,
    })),
  }));

  return (
    <Suspense>
      <PublicStore
        profile={{
          id: user.id,
          email: "",
          fullName: user.fullName,
          username: user.username,
          headline: user.headline,
          bio: user.bio,
          avatar: user.avatar,
          cover: user.cover,
          category: user.category,
          primaryGoal: user.primaryGoal,
        }}
        products={products}
        gateways={{
          stripe: Boolean(user.stripeSecretKey),
          bkash: Boolean(
            user.bkashAppKey && user.bkashAppSecret && user.bkashUsername && user.bkashPassword
          ),
        }}
      />
    </Suspense>
  );
}
