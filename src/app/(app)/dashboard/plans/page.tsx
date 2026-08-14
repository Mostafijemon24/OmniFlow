"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Profile } from "@/lib/types";
import { PLAN_LIST } from "@/lib/plans";
import { cachedJson, peekCache } from "@/lib/client-cache";

export default function PlansPage() {
  const [profile, setProfile] = useState<Profile | null>(() => {
    const data = peekCache<Profile & { error?: string }>("/api/profile");
    return data && !data.error ? data : null;
  });

  useEffect(() => {
    cachedJson<Profile & { error?: string }>("/api/profile")
      .then((data) => (data.error ? null : setProfile(data)))
      .catch(() => undefined);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-black text-white">Choose your plan</h2>
        <p className="mt-1 text-xs text-slate-400">
          Plans set how many products you can publish and how many Auto-DMs you can send each month.
        </p>
      </div>

      {profile?.planNotice && profile.planNotice.level !== "active" && (
        <p
          className={`rounded-2xl border p-3 text-xs font-semibold ${
            profile.planNotice.level === "expired"
              ? "border-red-500/30 bg-red-500/5 text-red-300"
              : "border-amber-500/30 bg-amber-500/5 text-amber-300"
          }`}
        >
          {profile.planNotice.message}
        </p>
      )}

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

              {current ? (
                <span className="w-full rounded-xl border border-slate-800 bg-dark-900 py-2.5 text-center text-xs font-bold text-slate-400">
                  Current plan
                </span>
              ) : (
                <Link
                  href={`/dashboard/checkout?plan=${plan.id}`}
                  className={`w-full rounded-xl py-2.5 text-center text-xs font-bold transition ${
                    highlighted
                      ? "bg-brand-600 text-white hover:bg-brand-500"
                      : "border border-slate-800 bg-dark-900 text-white hover:bg-dark-800"
                  }`}
                >
                  Choose {plan.name}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
