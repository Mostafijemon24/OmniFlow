import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { isSuperAdminEmail } from "./admin";

/**
 * Compared against when no account matches, so a wrong email and a wrong
 * password cost the same amount of time.
 */
const DUMMY_HASH = bcrypt.hashSync("omniflow-timing-equaliser", 12);

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/" },
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });

        const valid = await bcrypt.compare(credentials.password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          username: user.username,
          onboardingCompleted: user.onboardingCompleted,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.username = (user as { username?: string }).username;
        token.onboardingCompleted = (user as { onboardingCompleted?: boolean })
          .onboardingCompleted;
      }
      if (trigger === "update" && session) {
        token.username = session.username ?? token.username;
        token.onboardingCompleted =
          session.onboardingCompleted ?? token.onboardingCompleted;
        token.name = session.name ?? token.name;
      }

      // Recomputed on every call, after the client-supplied `update` merge
      // above, so the flag can never be injected from the browser and so
      // changing SUPER_ADMIN_EMAIL demotes live sessions on their next request.
      token.isSuperAdmin = isSuperAdminEmail(token.email);
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.onboardingCompleted = Boolean(token.onboardingCompleted);
        // For rendering only. Every protected route re-checks server-side.
        session.user.isSuperAdmin = Boolean(token.isSuperAdmin);
      }
      return session;
    },
  },
};
