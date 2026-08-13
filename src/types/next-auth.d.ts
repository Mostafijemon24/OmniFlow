import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      onboardingCompleted: boolean;
      isSuperAdmin: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    username?: string;
    onboardingCompleted?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string;
    onboardingCompleted?: boolean;
    /** Derived from SUPER_ADMIN_EMAIL on every callback, never from the client. */
    isSuperAdmin?: boolean;
  }
}
