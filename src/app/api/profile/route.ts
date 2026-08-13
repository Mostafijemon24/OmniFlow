import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, ownsAssetUrl, slugifyHandle } from "@/lib/utils";
import { planOf, trialDaysLeft } from "@/lib/plans";

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

  const plan = planOf(user.plan);
  const [productCount, metaAccounts] = await Promise.all([
    prisma.product.count({ where: { userId: user.id } }),
    prisma.metaAccount.count({ where: { userId: user.id } }),
  ]);

  return NextResponse.json({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    username: user.username,
    headline: user.headline,
    bio: user.bio,
    avatar: user.avatar,
    cover: user.cover,
    category: user.category,
    primaryGoal: user.primaryGoal,
    onboardingCompleted: user.onboardingCompleted,
    plan: user.plan,
    planName: plan.name,
    planStatus: user.planStatus,
    trialDaysLeft: trialDaysLeft(user.trialEndsAt),
    maxProducts: Number.isFinite(plan.maxProducts) ? plan.maxProducts : null,
    productCount,
    metaAccounts,
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
