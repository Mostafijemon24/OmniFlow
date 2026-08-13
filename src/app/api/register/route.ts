import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { isUniqueViolation, prisma } from "@/lib/prisma";
import { slugifyHandle } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const TRIAL_DAYS = 14;

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid registration data." },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase().trim();
    if (await prisma.user.findUnique({ where: { email } })) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const base = slugifyHandle(parsed.data.name) || "creator";
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    // Handles are unique, so a concurrent signup with the same display name is
    // retried rather than surfaced as a server error.
    for (let attempt = 0; attempt < 10; attempt++) {
      const username = attempt === 0 ? base : `${base}${attempt}`;
      try {
        const user = await prisma.user.create({
          data: {
            email,
            passwordHash,
            fullName: parsed.data.name.trim(),
            username,
            trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86400000),
          },
        });
        return NextResponse.json({ id: user.id, email: user.email, username: user.username });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
          return NextResponse.json(
            { error: "An account with this email already exists." },
            { status: 409 }
          );
        }
      }
    }

    return NextResponse.json(
      { error: "Could not allocate a handle. Try a different name." },
      { status: 409 }
    );
  } catch (error) {
    console.error("register", error);
    return NextResponse.json({ error: "Registration failed." }, { status: 500 });
  }
}
