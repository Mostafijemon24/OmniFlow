import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/utils";
import { decrypt } from "@/lib/crypto";
import { metaConnector } from "@/lib/platform-settings";
import { subscribePage, unsubscribePage } from "@/lib/meta";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.metaAccount.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const connector = await metaConnector();
  if (!connector) {
    return NextResponse.json(
      { error: "The Meta connector is not configured.", code: "connector_unavailable" },
      { status: 409 }
    );
  }
  if (account.needsReconnect) {
    return NextResponse.json(
      { error: "Reconnect this page before subscribing it to comment webhooks." },
      { status: 409 }
    );
  }

  try {
    await subscribePage(connector, account.pageId, decrypt(account.accessToken));
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
  const connector = await metaConnector();
  if (account.subscribed && connector) {
    await unsubscribePage(connector, account.pageId, decrypt(account.accessToken)).catch(
      () => undefined
    );
  }

  await prisma.metaAccount.delete({ where: { id: account.id } });
  return NextResponse.json({ disconnected: true });
}
