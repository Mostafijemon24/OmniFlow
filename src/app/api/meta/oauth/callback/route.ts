import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, appUrl } from "@/lib/utils";
import { encrypt, safeEqual } from "@/lib/crypto";
import { exchangeCodeForToken, fetchPages, longLivedToken } from "@/lib/meta";

export async function GET(req: NextRequest) {
  const settings = `${appUrl()}/dashboard/integrations`;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${appUrl()}/?error=signin_required`);

  const error = req.nextUrl.searchParams.get("error_description");
  if (error) return NextResponse.redirect(`${settings}?meta_error=${encodeURIComponent(error)}`);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = cookies().get("meta_oauth_state")?.value;

  if (!code || !state || !expected || !safeEqual(state, expected)) {
    return NextResponse.redirect(`${settings}?meta_error=Invalid+OAuth+state`);
  }
  cookies().delete("meta_oauth_state");

  try {
    const shortToken = await exchangeCodeForToken(code);
    const { token, expiresIn } = await longLivedToken(shortToken);
    const pages = await fetchPages(token);

    if (!pages.length) {
      return NextResponse.redirect(`${settings}?meta_error=No+pages+found+on+this+account`);
    }

    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    for (const page of pages) {
      const igId = page.instagram_business_account?.id ?? null;
      await prisma.metaAccount.upsert({
        where: { pageId: page.id },
        update: {
          userId: user.id,
          pageName: page.name,
          igUserId: igId,
          platform: igId ? "instagram" : "facebook",
          accessToken: encrypt(page.access_token),
          tokenExpiresAt: expiresAt,
        },
        create: {
          userId: user.id,
          pageId: page.id,
          pageName: page.name,
          igUserId: igId,
          platform: igId ? "instagram" : "facebook",
          accessToken: encrypt(page.access_token),
          tokenExpiresAt: expiresAt,
        },
      });
    }

    return NextResponse.redirect(`${settings}?meta_connected=${pages.length}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Meta connection failed.";
    return NextResponse.redirect(`${settings}?meta_error=${encodeURIComponent(message)}`);
  }
}
