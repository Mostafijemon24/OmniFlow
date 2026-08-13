"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Profile } from "@/lib/types";
import { useUi } from "@/components/providers/ui-provider";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "$19",
    perks: ["1 bio store profile", "Up to 3 products", "500 Auto-DMs / month", "Standard analytics"],
  },
  {
    id: "pro",
    name: "Pro Growth",
    price: "$49",
    perks: [
      "Unlimited products & calls",
      "Unlimited Auto-DMs",
      "Advanced funnel analytics",
      "0% platform fees",
    ],
    popular: true,
  },
  {
    id: "agency",
    name: "Agency & Team",
    price: "$99",
    perks: ["Everything in Pro", "Priority webhook routing", "Team collaboration", "Account manager"],
  },
];

export default function BillingPage() {
  const { triggerToast } = useUi();
  const params = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => (data.error ? null : setProfile(data)));
    if (params.get("upgraded")) triggerToast("Subscription active. Thanks for upgrading!");
  }, [params, triggerToast]);

  async function subscribe(plan: string) {
    setBusy(plan);
    const res = await fetch("/api/billing/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      triggerToast(data.error);
      return;
    }
    window.location.href = data.url;
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
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`glass-card flex flex-col justify-between space-y-4 rounded-2xl p-5 ${
              plan.popular ? "border-2 border-brand-500" : "border border-slate-800"
            }`}
          >
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {plan.name}
              </span>
              <div className="text-2xl font-black text-white">
                {plan.price} <span className="text-xs font-normal text-slate-400">/month</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {plan.perks.map((perk) => (
                  <li key={perk}>
                    <i className="fa-solid fa-check mr-2 text-emerald-400" />
                    {perk}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => subscribe(plan.id)}
              disabled={busy === plan.id || profile?.plan === plan.id}
              className={`w-full rounded-xl py-2.5 text-xs font-bold transition disabled:opacity-50 ${
                plan.popular
                  ? "bg-brand-600 text-white hover:bg-brand-500"
                  : "border border-slate-800 bg-dark-900 text-white hover:bg-dark-800"
              }`}
            >
              {profile?.plan === plan.id
                ? "Current plan"
                : busy === plan.id
                  ? "Redirecting..."
                  : `Switch to ${plan.name}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
