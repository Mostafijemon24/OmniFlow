import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/utils";
import { metaConnector } from "@/lib/platform-settings";
import { metaAuthUrl } from "@/lib/meta";
import { randomToken } from "@/lib/crypto";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const connector = await metaConnector();
  if (!connector) {
    return NextResponse.json(
      {
        error:
          "Instagram and Facebook are not available yet. The platform administrator has not set up the Meta connector.",
        code: "connector_unavailable",
      },
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

  return NextResponse.redirect(metaAuthUrl(connector, state));
}
