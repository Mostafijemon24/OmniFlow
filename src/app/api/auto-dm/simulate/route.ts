import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, storeUrl } from "@/lib/utils";
import { resolveRule } from "@/lib/meta";

const schema = z.object({
  comment: z.string().min(1).max(500),
  platform: z.enum(["facebook", "instagram"]).optional(),
});

/**
 * Dry-run of the live matcher. It resolves against the creator's real rules but
 * never sends a DM and never writes analytics, so funnel data stays truthful.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Comment text is required." }, { status: 400 });
  }

  const rules = await prisma.autoDMRule.findMany({
    where: {
      userId: user.id,
      active: true,
      ...(parsed.data.platform ? { platform: parsed.data.platform } : {}),
    },
    include: { targetProduct: true, metaAccount: true },
    orderBy: { createdAt: "desc" },
  });

  const matched = resolveRule(parsed.data.comment, rules);

  if (!matched) return NextResponse.json({ matched: false });

  return NextResponse.json({
    matched: true,
    dryRun: true,
    rule: {
      id: matched.id,
      keyword: matched.keyword,
      platform: matched.platform,
      autoMessage: matched.autoMessage,
    },
    product: matched.targetProduct,
    link: storeUrl(user.username, matched.targetProductId),
    liveReady: Boolean(matched.metaAccount?.subscribed),
    warning: matched.metaAccount?.subscribed
      ? null
      : "Connect and subscribe a Meta page to dispatch this rule for real comments.",
  });
}
