import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, appUrl } from "@/lib/utils";
import { safeEqual } from "@/lib/crypto";
import { metaConnector } from "@/lib/platform-settings";
import { exchangeCodeForToken, facebookLinkRedirectUri, fetchMetaProfile } from "@/lib/meta";

export async function GET(req: NextRequest) {
  const connections = `${appUrl()}/dashboard/connections`;
  const back = (message: string, ok = false) =>
    NextResponse.redirect(
      `${connections}?${ok ? "link_ok" : "link_error"}=${encodeURIComponent(message)}`
    );

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${appUrl()}/?error=signin_required`);

  const connector = await metaConnector();
  if (!connector) return back("Facebook is not available right now.");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = cookies().get("fb_link_state")?.value;
  if (!code || !state || !expected || !safeEqual(state, expected)) {
    return back("That link request expired. Please try again.");
  }
  cookies().delete("fb_link_state");

  try {
    const token = await exchangeCodeForToken(connector, code, facebookLinkRedirectUri());
    const profile = await fetchMetaProfile(connector, token);

    const existing = await prisma.socialAccount.findUnique({
      where: { provider_providerAccountId: { provider: "facebook", providerAccountId: profile.id } },
    });
    if (existing && existing.userId !== user.id) {
      return back("That Facebook account is already linked to another OmniFlow account.");
    }
    if (existing) return back("Facebook is already linked to this account.", true);

    await prisma.socialAccount.create({
      data: {
        userId: user.id,
        provider: "facebook",
        providerAccountId: profile.id,
        email: profile.email?.toLowerCase() ?? null,
        name: profile.name ?? null,
      },
    });

    return back("Facebook linked. You can sign in with it from now on.", true);
  } catch (error) {
    return back(error instanceof Error ? error.message : "Could not link Facebook.");
  }
}
