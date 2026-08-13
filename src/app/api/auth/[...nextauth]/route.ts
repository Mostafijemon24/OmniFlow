import NextAuth from "next-auth";
import { NextRequest } from "next/server";
import { buildAuthOptions } from "@/lib/auth";

/**
 * Options are built per request because the Facebook provider's credentials
 * live in the database and only exist once the super admin has configured the
 * Meta connector.
 */
async function handler(req: NextRequest, ctx: { params: { nextauth: string[] } }) {
  return NextAuth(req, ctx, await buildAuthOptions());
}

export { handler as GET, handler as POST };
