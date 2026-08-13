type SendArgs = {
  to: string;
  subject: string;
  html: string;
};

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail({ to, subject, html }: SendArgs) {
  if (!isEmailConfigured()) {
    return { ok: false, status: "unconfigured" as const, detail: "RESEND_API_KEY is not set." };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "OmniFlow <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return { ok: false, status: "failed" as const, detail: detail.slice(0, 500) };
  }

  return { ok: true, status: "sent" as const, detail: null };
}

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Buyer and creator supplied text reaches this template, so nothing is interpolated raw. */
function escUrl(value: string) {
  return /^https?:\/\//i.test(value) ? esc(value) : "";
}

export function deliveryEmailHtml(args: {
  customerName: string;
  productTitle: string;
  creatorName: string;
  downloadUrl?: string;
  meetingLink?: string;
  startsAt?: Date | null;
  expiresAt?: Date;
}) {
  const cta = args.downloadUrl
    ? `<a href="${escUrl(args.downloadUrl)}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:700">Download your file</a>
       <p style="color:#64748b;font-size:12px">This secure link expires on ${args.expiresAt?.toUTCString()}.</p>`
    : `<a href="${escUrl(args.meetingLink || "")}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:700">Join your session</a>
       <p style="color:#64748b;font-size:12px">Scheduled for ${args.startsAt?.toUTCString()}.</p>`;

  return `<div style="font-family:Inter,Arial,sans-serif;background:#0b0f19;padding:32px">
    <div style="max-width:520px;margin:auto;background:#111827;border:1px solid #1f293d;border-radius:20px;padding:28px;color:#e2e8f0">
      <h1 style="font-size:18px;margin:0 0 8px">Thanks for your purchase, ${esc(args.customerName)}!</h1>
      <p style="font-size:14px;color:#94a3b8;margin:0 0 20px">
        Your order for <b style="color:#fff">${esc(args.productTitle)}</b> from ${esc(args.creatorName)} is confirmed.
      </p>
      ${cta}
      <hr style="border:none;border-top:1px solid #1f293d;margin:24px 0" />
      <p style="font-size:11px;color:#64748b;margin:0">Delivered automatically by OmniFlow.</p>
    </div>
  </div>`;
}
