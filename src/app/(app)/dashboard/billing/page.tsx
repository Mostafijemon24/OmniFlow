"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ManualPayment, Profile } from "@/lib/types";
import { useUi } from "@/components/providers/ui-provider";
import { cachedJson, peekCache } from "@/lib/client-cache";

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-500/20 text-amber-400",
  APPROVED: "bg-emerald-500/20 text-emerald-400",
  REJECTED: "bg-red-500/20 text-red-400",
};

export default function BillingPage() {
  const { triggerToast } = useUi();
  const params = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(() => {
    const data = peekCache<Profile & { error?: string }>("/api/profile");
    return data && !data.error ? data : null;
  });
  const [payments, setPayments] = useState<ManualPayment[]>(() => {
    const data = peekCache<{ payments?: ManualPayment[] }>("/api/payments/manual");
    return data?.payments ?? [];
  });

  const load = useCallback(async () => {
    const [profileData, paymentsData] = await Promise.all([
      cachedJson<Profile & { error?: string }>("/api/profile"),
      cachedJson<{ payments?: ManualPayment[] }>("/api/payments/manual"),
    ]);
    if (!profileData.error) setProfile(profileData);
    setPayments(paymentsData.payments ?? []);
  }, []);

  useEffect(() => {
    load();
    if (params.get("upgraded")) triggerToast("Subscription active. Thanks for upgrading!");
  }, [load, params, triggerToast]);

  const pending = payments.filter((p) => p.status === "PENDING").length;

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl border border-slate-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">Current plan</h3>
          <Link
            href="/dashboard/plans"
            className="rounded-xl bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-brand-500"
          >
            Change plan
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-6 pt-4 text-xs">
          <div>
            <span className="block text-[10px] font-bold uppercase text-slate-500">Plan</span>
            <span className="text-lg font-black text-white">{profile?.planName || "—"}</span>
          </div>
          <div>
            <span className="block text-[10px] font-bold uppercase text-slate-500">Status</span>
            <span className="text-lg font-black text-brand-400">{profile?.planStatus || "—"}</span>
          </div>
          <div>
            <span className="block text-[10px] font-bold uppercase text-slate-500">
              Products used
            </span>
            <span className="text-lg font-black text-emerald-400">
              {profile?.productCount ?? 0}
              {profile?.maxProducts ? ` / ${profile.maxProducts}` : ""}
            </span>
          </div>
          {profile?.planStatus === "trialing" && (
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-500">Trial</span>
              <span className="text-lg font-black text-amber-400">
                {profile.trialDaysLeft} days left
              </span>
            </div>
          )}
        </div>

        {profile?.planNotice && (
          <p
            className={`mt-4 rounded-xl border p-3 text-[11px] font-semibold ${
              profile.planNotice.level === "expired"
                ? "border-red-500/30 bg-red-500/5 text-red-300"
                : profile.planNotice.level === "expiring"
                  ? "border-amber-500/30 bg-amber-500/5 text-amber-300"
                  : "border-slate-800 bg-dark-900 text-slate-400"
            }`}
          >
            {profile.planNotice.message}
          </p>
        )}

        {profile?.effectivePlanName &&
          profile.effectivePlanName !== profile.planName && (
            <p className="mt-2 text-[11px] text-slate-400">
              Limits currently applied: <b className="text-white">{profile.effectivePlanName}</b>.
            </p>
          )}
      </div>

      <div className="glass-card rounded-2xl border border-slate-800 p-5">
        <h3 className="border-b border-slate-800 pb-2.5 text-xs font-bold uppercase tracking-wider text-white">
          bKash payments
          {pending > 0 && (
            <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-300">
              {pending} awaiting review
            </span>
          )}
        </h3>

        {payments.length === 0 ? (
          <p className="pt-4 text-xs text-slate-400">
            You have not submitted any bKash payments.
          </p>
        ) : (
          <div className="space-y-2 pt-4">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-dark-900 p-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white">
                    {payment.plan} · {payment.currency}{" "}
                    {(payment.amountCents / 100).toFixed(2)}
                  </p>
                  <p className="font-mono text-[10px] text-slate-500">TrxID {payment.trxId}</p>
                  <p className="text-[10px] text-slate-500">
                    {new Date(payment.createdAt).toLocaleString()}
                  </p>
                  {payment.reviewNote && (
                    <p className="mt-1 text-[11px] text-slate-400">{payment.reviewNote}</p>
                  )}
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                    STATUS_STYLE[payment.status] ?? "bg-slate-700 text-slate-300"
                  }`}
                >
                  {payment.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
