import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/utils";
import { metaConnector } from "@/lib/platform-settings";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accounts = await prisma.metaAccount.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      pageId: true,
      pageName: true,
      platform: true,
      igUserId: true,
      subscribed: true,
      needsReconnect: true,
      tokenExpiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ configured: Boolean(await metaConnector()), accounts });
}
