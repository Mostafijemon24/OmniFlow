import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import FacebookProvider from "next-auth/providers/facebook";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { isSuperAdminEmail } from "./admin";
import { metaConnector } from "./platform-settings";
import { createCreatorAccount } from "./users";
import { LOGIN_SCOPES } from "./meta";

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
    /**
     * No auto-linking. A provider-asserted email is not proof of control over
     * an existing OmniFlow account, so a Facebook signup whose email already
     * belongs to a password account is refused and the owner is told to link it
     * from inside their own session instead.
     */
    async signIn({ user, account, profile }) {
      if (account?.provider !== "facebook") return true;

      const providerAccountId = account.providerAccountId;
      const existingLink = await prisma.socialAccount.findUnique({
        where: { provider_providerAccountId: { provider: "facebook", providerAccountId } },
      });
      if (existingLink) return true;

      const email = (profile?.email || user.email || "").toLowerCase().trim();
      if (!email) return "/?social_error=no_email";

      if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
        return "/?social_error=email_exists";
      }

      const created = await createCreatorAccount({
        email,
        fullName: user.name || profile?.name || "Creator",
      });
      if (!created.ok) return "/?social_error=signup_failed";

      await prisma.socialAccount.create({
        data: {
          userId: created.user.id,
          provider: "facebook",
          providerAccountId,
          email,
          name: created.user.fullName,
        },
      });
      return true;
    },

    async jwt({ token, user, account, trigger, session }) {
      // A social sign-in carries the provider's identifiers, not ours, so the
      // OmniFlow account is resolved through the link row.
      if (account?.provider === "facebook") {
        const link = await prisma.socialAccount.findUnique({
          where: {
            provider_providerAccountId: {
              provider: "facebook",
              providerAccountId: account.providerAccountId,
            },
          },
          include: { user: true },
        });
        if (link) {
          token.id = link.user.id;
          token.email = link.user.email;
          token.name = link.user.fullName;
          token.username = link.user.username;
          token.onboardingCompleted = link.user.onboardingCompleted;
        }
      } else if (user) {
        token.id = user.id;
        token.email = user.email;
        token.username = (user as { username?: string }).username;
        token.onboardingCompleted = (user as { onboardingCompleted?: boolean })
          .onboardingCompleted;
      }
      if (trigger === "update" && session) {
        const patch = session as {
          username?: string;
          onboardingCompleted?: boolean;
          name?: string;
          user?: { username?: string; onboardingCompleted?: boolean; name?: string };
        };
        token.username = patch.username ?? patch.user?.username ?? token.username;
        token.name = patch.name ?? patch.user?.name ?? token.name;
        if (typeof patch.onboardingCompleted === "boolean") {
          token.onboardingCompleted = patch.onboardingCompleted;
        } else if (typeof patch.user?.onboardingCompleted === "boolean") {
          token.onboardingCompleted = patch.user.onboardingCompleted;
        }
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

/**
 * NextAuth options for one request.
 *
 * The Facebook provider only exists once the super admin has configured the
 * Meta connector, and its credentials live in the database, so the provider
 * list cannot be a module constant. `authOptions` stays the credentials-only
 * base: it is what every `getServerSession(authOptions)` call in the app reads,
 * and since session decoding depends on the secret and the callbacks rather
 * than on the provider list, both objects decode the same sessions.
 */
export async function buildAuthOptions(): Promise<NextAuthOptions> {
  const connector = await metaConnector();
  if (!connector) return authOptions;

  return {
    ...authOptions,
    providers: [
      ...authOptions.providers,
      FacebookProvider({
        clientId: connector.appId,
        clientSecret: connector.appSecret,
        authorization: { params: { scope: LOGIN_SCOPES } },
      }),
    ],
  };
}
