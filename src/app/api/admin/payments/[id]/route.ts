import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/guards";
import { activateManualPlan } from "@/lib/subscriptions";
import { isPlanId, PLANS } from "@/lib/plans";
import { sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/utils";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().max(300).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid review action." }, { status: 400 });
  }
  const { action, note } = parsed.data;

  const payment = await prisma.manualPayment.findUnique({ where: { id: params.id } });
  if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

  // The state transition is the guard, not the read above. Only a row that is
  // still PENDING moves, so a double-click or a replayed request cannot grant a
  // second plan period.
  const claimed = await prisma.manualPayment.updateMany({
    where: { id: payment.id, status: "PENDING" },
    data: {
      status: action === "approve" ? "APPROVED" : "REJECTED",
      reviewedBy: guard.user.email,
      reviewedAt: new Date(),
      reviewNote: note || null,
    },
  });

  if (claimed.count !== 1) {
    return NextResponse.json(
      { error: `This payment was already ${payment.status.toLowerCase()}.`, status: payment.status },
      { status: 409 }
    );
  }

  if (action === "reject") {
    if (payment.userId) {
      await notify(
        payment.userId,
        "Your OmniFlow payment could not be verified",
        `<p>We could not match transaction <b>${payment.trxId}</b> against our bKash account.</p>
         <p>${note ? escapeHtml(note) : "Please double-check the transaction ID and submit it again."}</p>`
      );
    }
    return NextResponse.json({ status: "REJECTED" });
  }

  if (payment.kind !== "subscription" || !payment.userId || !isPlanId(payment.plan)) {
    return NextResponse.json(
      { error: "This payment is not a plan purchase and cannot be activated." },
      { status: 409 }
    );
  }

  const user = await activateManualPlan(payment.userId, payment.plan);
  if (!user) {
    return NextResponse.json({ error: "That account no longer exists." }, { status: 409 });
  }

  await notify(
    user.id,
    `Your ${PLANS[payment.plan].name} plan is active`,
    `<p>We verified transaction <b>${payment.trxId}</b> and activated your
      <b>${PLANS[payment.plan].name}</b> plan.</p>
     <p>It is paid until <b>${user.planPeriodEnd?.toDateString()}</b>. Manual payments do not renew
      automatically — submit another payment before that date to keep the plan.</p>
     <p><a href="${appUrl()}/dashboard/billing">View your billing page</a></p>`
  );

  return NextResponse.json({
    status: "APPROVED",
    plan: user.plan,
    planPeriodEnd: user.planPeriodEnd,
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Email is best effort: an unconfigured mailer must not fail the review. */
async function notify(userId: string, subject: string, body: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return;
  await sendEmail({
    to: user.email,
    subject,
    html: `<div style="font-family:Inter,Arial,sans-serif;background:#0b0f19;padding:32px">
      <div style="max-width:520px;margin:auto;background:#111827;border:1px solid #1f293d;border-radius:20px;padding:28px;color:#e2e8f0">
        <h1 style="font-size:18px;margin:0 0 12px">${subject}</h1>
        <div style="font-size:14px;color:#94a3b8">${body}</div>
      </div>
    </div>`,
  }).catch(() => undefined);
}
