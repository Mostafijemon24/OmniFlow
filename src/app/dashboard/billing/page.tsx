"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Profile } from "@/lib/types";
import { PLAN_LIST } from "@/lib/plans";
import { useUi } from "@/components/providers/ui-provider";

export default function BillingPage() {
  const { triggerToast } = useUi();
  const params = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => (data.error ? null : setProfile(data)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    if (params.get("upgraded")) triggerToast("Subscription active. Thanks for upgrading!");
  }, [load, params, triggerToast]);

  async function subscribe(plan: string) {
    setBusy(plan);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        triggerToast(data.error || "Could not start the upgrade.");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      triggerToast("Your subscription was switched.");
      load();
    } catch {
      triggerToast("Could not reach the billing service.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl border border-slate-800 p-5">
        <h3 className="border-b border-slate-800 pb-2.5 text-xs font-bold uppercase tracking-wider text-white">
          Current plan
        </h3>
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
            <span className="block text-[10px] font-bold uppercase text-slate-500">Products used</span>
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
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLAN_LIST.map((plan) => {
          const current = profile?.plan === plan.id;
          const highlighted = plan.id === "pro";

          return (
            <div
              key={plan.id}
              className={`glass-card flex flex-col justify-between space-y-4 rounded-2xl p-5 ${
                highlighted ? "border-2 border-brand-500" : "border border-slate-800"
              }`}
            >
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {plan.name}
                </span>
                <div className="text-2xl font-black text-white">
                  ${plan.priceUsd}{" "}
                  <span className="text-xs font-normal text-slate-400">/month</span>
                </div>
                <p className="text-[11px] text-slate-400">{plan.tagline}</p>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <i className="fa-solid fa-check mr-2 text-emerald-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => subscribe(plan.id)}
                disabled={busy !== null || current}
                className={`w-full rounded-xl py-2.5 text-xs font-bold transition disabled:opacity-50 ${
                  highlighted
                    ? "bg-brand-600 text-white hover:bg-brand-500"
                    : "border border-slate-800 bg-dark-900 text-white hover:bg-dark-800"
                }`}
              >
                {current
                  ? "Current plan"
                  : busy === plan.id
                    ? "Redirecting..."
                    : `Switch to ${plan.name}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
