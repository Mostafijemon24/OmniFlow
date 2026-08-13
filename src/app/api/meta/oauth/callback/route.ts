import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, appUrl } from "@/lib/utils";
import { encrypt, safeEqual } from "@/lib/crypto";
import { exchangeCodeForToken, fetchPages, longLivedToken } from "@/lib/meta";

export async function GET(req: NextRequest) {
  const settings = `${appUrl()}/dashboard/connections`;
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
    let connected = 0;
    let claimedElsewhere = 0;

    for (const page of pages) {
      const igId = page.instagram_business_account?.id ?? null;

      // A page is globally unique, so re-connecting must never move someone
      // else's page (and its stored token) onto this account.
      const existing = await prisma.metaAccount.findUnique({ where: { pageId: page.id } });
      if (existing && existing.userId !== user.id) {
        claimedElsewhere++;
        continue;
      }

      const data = {
        pageName: page.name,
        igUserId: igId,
        platform: igId ? "instagram" : "facebook",
        accessToken: encrypt(page.access_token),
        tokenExpiresAt: expiresAt,
      };

      if (existing) {
        await prisma.metaAccount.update({ where: { id: existing.id }, data });
      } else {
        await prisma.metaAccount.create({
          data: { ...data, userId: user.id, pageId: page.id },
        });
      }
      connected++;
    }

    if (!connected) {
      return NextResponse.redirect(
        `${settings}?meta_error=${encodeURIComponent(
          "Those pages are already connected to another OmniFlow account."
        )}`
      );
    }

    return NextResponse.redirect(
      `${settings}?meta_connected=${connected}${claimedElsewhere ? `&meta_skipped=${claimedElsewhere}` : ""}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Meta connection failed.";
    return NextResponse.redirect(`${settings}?meta_error=${encodeURIComponent(message)}`);
  }
}
