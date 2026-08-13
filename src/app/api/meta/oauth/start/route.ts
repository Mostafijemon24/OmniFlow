import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/utils";
import { isMetaConfigured, metaAuthUrl } from "@/lib/meta";
import { randomToken } from "@/lib/crypto";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isMetaConfigured()) {
    return NextResponse.json(
      { error: "META_APP_ID and META_APP_SECRET must be set to connect Meta." },
      { status: 409 }
    );
  }

  const state = randomToken(16);
  cookies().set("meta_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(metaAuthUrl(state));
}
