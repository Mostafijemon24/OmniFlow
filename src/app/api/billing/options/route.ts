import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/utils";
import { isPlanId, PLANS } from "@/lib/plans";
import { bkashAmountCentsForUsd, planGateways } from "@/lib/platform-settings";

/** What a creator can actually use to pay for one plan, resolved server-side. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requested = req.nextUrl.searchParams.get("plan");
  if (!isPlanId(requested)) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }
  const plan = PLANS[requested];
  const gateways = await planGateways(plan.id);

  return NextResponse.json({
    plan: {
      id: plan.id,
      name: plan.name,
      priceUsd: plan.priceUsd,
      tagline: plan.tagline,
      features: plan.features,
    },
    stripe: gateways.stripe,
    bkash: gateways.bkash,
    bkashNumber: gateways.bkashNumber,
    bkashInstructions: gateways.bkashInstructions,
    bkashAmountCents: gateways.bkash ? await bkashAmountCentsForUsd(plan.priceUsd) : null,
    currentPlan: user.plan,
    currentStatus: user.planStatus,
  });
}
