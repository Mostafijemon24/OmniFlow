import { cache } from "react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { PublicStore } from "@/components/store/public-store";
import { storeGateways } from "@/lib/platform-settings";
import { currencyToCode } from "@/lib/utils";
import { Product } from "@/lib/types";

const RESERVED = new Set(["dashboard", "onboarding", "api", "auth", "favicon.ico"]);

const getCreator = cache(async (username: string) =>
  prisma.user.findUnique({
    where: { username },
    include: {
      products: {
        where: { active: true },
        include: { slots: { where: { booked: false }, orderBy: { startsAt: "asc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  })
);

export async function generateMetadata({ params }: { params: { username: string } }) {
  const user = await getCreator(params.username);
  if (!user) return { title: "Store not found" };
  return {
    title: `${user.fullName} | OmniFlow Store`,
    description: user.bio || user.headline || "OmniFlow creator storefront",
  };
}

export default async function PublicBioPage({
  params,
  searchParams,
}: {
  params: { username: string };
  searchParams: { preview?: string };
}) {
  if (RESERVED.has(params.username)) notFound();

  const user = await getCreator(params.username);
  if (!user) notFound();

  // Preview links from the studio skip analytics and must not block first paint.
  if (searchParams.preview !== "1") {
    void prisma.funnelEvent.create({
      data: { userId: user.id, type: "bio_visit", metadata: params.username },
    });
  }

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

  // Gateway availability depends on the currency a product is priced in, so it
  // is resolved once per distinct currency rather than once for the store.
  const symbols = Array.from(new Set(products.map((p) => p.currency)));
  const gateways: Record<string, { stripe: boolean; bkash: boolean }> = {};
  if (symbols.length) {
    await Promise.all(
      symbols.map(async (symbol) => {
        const { stripe, bkash } = await storeGateways(currencyToCode(symbol));
        gateways[symbol] = { stripe, bkash };
      })
    );
  }

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
        gateways={gateways}
      />
    </Suspense>
  );
}
