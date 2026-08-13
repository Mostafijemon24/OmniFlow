import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createCreatorAccount } from "@/lib/users";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid registration data." },
        { status: 400 }
      );
    }

    const result = await createCreatorAccount({
      email: parsed.data.email,
      fullName: parsed.data.name,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.reason === "email_taken"
              ? "An account with this email already exists."
              : "Could not allocate a handle. Try a different name.",
        },
        { status: 409 }
      );
    }

    const { user } = result;
    return NextResponse.json({ id: user.id, email: user.email, username: user.username });
  } catch (error) {
    console.error("register", error);
    return NextResponse.json({ error: "Registration failed." }, { status: 500 });
  }
}
