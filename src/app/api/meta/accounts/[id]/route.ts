import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/utils";
import { decrypt } from "@/lib/crypto";
import { subscribePage, unsubscribePage } from "@/lib/meta";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.metaAccount.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  try {
    await subscribePage(account.pageId, decrypt(account.accessToken));
    const updated = await prisma.metaAccount.update({
      where: { id: account.id },
      data: { subscribed: true },
    });
    return NextResponse.json({ subscribed: updated.subscribed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Subscription failed." },
      { status: 502 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.metaAccount.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  // Best effort: stop Meta from delivering webhooks for a page we will no
  // longer hold a token for. A failure here must not block the disconnect.
  if (account.subscribed) {
    await unsubscribePage(account.pageId, decrypt(account.accessToken)).catch(() => undefined);
  }

  await prisma.metaAccount.delete({ where: { id: account.id } });
  return NextResponse.json({ disconnected: true });
}
