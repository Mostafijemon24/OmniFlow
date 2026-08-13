import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/utils";
import { metaConnector } from "@/lib/platform-settings";
import { LOGIN_SCOPES, facebookLinkRedirectUri, oauthDialogUrl } from "@/lib/meta";
import { randomToken } from "@/lib/crypto";

/**
 * Links Facebook to the account that is already signed in.
 *
 * Signing in through NextAuth would start a *new* session rather than attach an
 * identity to the current one, so linking runs its own OAuth exchange and only
 * ever writes a link row for the session user.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const connector = await metaConnector();
  if (!connector) {
    return NextResponse.json(
      { error: "Facebook is not available yet.", code: "connector_unavailable" },
      { status: 409 }
    );
  }

  const state = randomToken(16);
  cookies().set("fb_link_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(
    oauthDialogUrl(connector, {
      state,
      redirectUri: facebookLinkRedirectUri(),
      scope: LOGIN_SCOPES,
    })
  );
}
