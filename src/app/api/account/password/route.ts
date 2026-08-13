import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/utils";

const schema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters.").max(200),
});

/** Sets a first password on a Facebook-created account, or changes an existing one. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid password." },
      { status: 400 }
    );
  }

  // Changing an existing password requires proving you know it, so a borrowed
  // session cannot quietly take the account over.
  if (user.passwordHash) {
    const valid =
      Boolean(parsed.data.currentPassword) &&
      (await bcrypt.compare(parsed.data.currentPassword!, user.passwordHash));
    if (!valid) {
      return NextResponse.json({ error: "That current password is wrong." }, { status: 403 });
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12) },
  });

  return NextResponse.json({ updated: true });
}
