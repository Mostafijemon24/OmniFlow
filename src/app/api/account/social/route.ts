import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/utils";
import { metaConnector } from "@/lib/platform-settings";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accounts = await prisma.socialAccount.findMany({
    where: { userId: user.id },
    select: { id: true, provider: true, email: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    available: Boolean(await metaConnector()),
    hasPassword: Boolean(user.passwordHash),
    accounts,
  });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const link = await prisma.socialAccount.findFirst({ where: { id, userId: user.id } });
  if (!link) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Unlinking the only way into an account would lock its owner out.
  const remaining = await prisma.socialAccount.count({
    where: { userId: user.id, NOT: { id } },
  });
  if (!user.passwordHash && remaining === 0) {
    return NextResponse.json(
      { error: "Set a password first, otherwise you would have no way to sign in." },
      { status: 409 }
    );
  }

  await prisma.socialAccount.delete({ where: { id: link.id } });
  return NextResponse.json({ unlinked: true });
}
