import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

const ADMIN_PAGES = ["/dashboard/admin"];
const ADMIN_APIS = ["/api/admin"];

/**
 * A UX and defence-in-depth gate only: it can see the JWT but never the
 * database. Authorization proper lives in `requireSuperAdmin()`, which every
 * admin route calls for itself.
 */
export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const isAdmin = Boolean(req.nextauth.token?.isSuperAdmin);

    if (!isAdmin && ADMIN_APIS.some((prefix) => pathname.startsWith(prefix))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!isAdmin && ADMIN_PAGES.some((prefix) => pathname.startsWith(prefix))) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    const onboarded = Boolean(req.nextauth.token?.onboardingCompleted);
    if (pathname.startsWith("/dashboard") && !onboarded) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }
    if (pathname === "/onboarding" && onboarded) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        // Admin APIs answer 404 from the middleware body for both anonymous and
        // non-admin callers, so they must not be bounced to the sign-in page.
        if (ADMIN_APIS.some((prefix) => pathname.startsWith(prefix))) return true;
        if (pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding")) {
          return Boolean(token);
        }
        return true;
      },
    },
  }
);

export const config = {
  // Webhook and public checkout routes are deliberately absent: they are
  // unauthenticated by design.
  matcher: ["/dashboard/:path*", "/onboarding", "/api/admin/:path*"],
};
