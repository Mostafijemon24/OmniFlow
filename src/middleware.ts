import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: ({ token, req }) => {
      const isDashboard = req.nextUrl.pathname.startsWith("/dashboard");
      const isOnboarding = req.nextUrl.pathname.startsWith("/onboarding");
      if (isDashboard || isOnboarding) return Boolean(token);
      return true;
    },
  },
});

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding"],
};
