import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, ownsAssetUrl, slugifyHandle } from "@/lib/utils";
import { effectivePlanOf, planOf, trialDaysLeft } from "@/lib/plans";
import { planNotice } from "@/lib/subscriptions";
import { isSuperAdminEmail } from "@/lib/admin";
import { ensureSuperAdminEntitlements } from "@/lib/users";

const schema = z.object({
  fullName: z.string().min(2).max(80).optional(),
  username: z.string().min(3).max(24).optional(),
  headline: z.string().max(120).optional(),
  bio: z.string().max(600).optional(),
  avatar: z.string().max(300).optional(),
  cover: z.string().max(300).optional(),
  category: z.string().max(80).optional(),
  primaryGoal: z.string().max(120).optional(),
  onboardingCompleted: z.boolean().optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const account = isSuperAdminEmail(user.email)
    ? await ensureSuperAdminEntitlements(user)
    : user;

  // `plan` is what the creator bought; `effective` is what currently applies,
  // which differs once a manually paid period has lapsed.
  const plan = planOf(account.plan);
  const effective = effectivePlanOf(account);
  const [productCount, metaAccounts] = await Promise.all([
    prisma.product.count({ where: { userId: account.id } }),
    prisma.metaAccount.count({ where: { userId: account.id } }),
  ]);
  const superAdmin = isSuperAdminEmail(account.email);

  return NextResponse.json({
    id: account.id,
    email: account.email,
    fullName: account.fullName,
    username: account.username,
    headline: account.headline,
    bio: account.bio,
    avatar: account.avatar,
    cover: account.cover,
    category: account.category,
    primaryGoal: account.primaryGoal,
    onboardingCompleted: account.onboardingCompleted,
    plan: account.plan,
    planName: superAdmin ? "Platform" : plan.name,
    planStatus: account.planStatus,
    planPeriodEnd: account.planPeriodEnd,
    planNotice: superAdmin ? null : planNotice(account),
    effectivePlanName: superAdmin ? "Platform" : effective.name,
    trialDaysLeft: superAdmin ? 0 : trialDaysLeft(account.trialEndsAt),
    maxProducts: superAdmin ? null : effective.maxProducts,
    productCount,
    metaAccounts,
    isSuperAdmin: superAdmin,
  });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile data." }, { status: 400 });
  }

  const data = { ...parsed.data };

  for (const field of ["avatar", "cover"] as const) {
    const value = data[field];
    if (value && !(await ownsAssetUrl(user.id, value))) {
      return NextResponse.json({ error: `Upload your ${field} image again.` }, { status: 403 });
    }
  }

  if (data.username !== undefined) {
    const username = slugifyHandle(data.username);
    if (username.length < 3) {
      return NextResponse.json(
        { error: "Handle must be at least 3 characters (letters, numbers, underscore)." },
        { status: 400 }
      );
    }
    const taken = await prisma.user.findFirst({
      where: { username, NOT: { id: user.id } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json({ error: "That handle is already taken." }, { status: 409 });
    }
    data.username = username;
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data });

  return NextResponse.json({
    id: updated.id,
    fullName: updated.fullName,
    username: updated.username,
    headline: updated.headline,
    bio: updated.bio,
    avatar: updated.avatar,
    onboardingCompleted: updated.onboardingCompleted,
  });
}
