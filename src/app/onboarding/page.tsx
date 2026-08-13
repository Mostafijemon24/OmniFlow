"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useUi } from "@/components/providers/ui-provider";

const niches = [
  "Tech & Creator Economy",
  "Digital Marketing & Growth",
  "Coaching & Mentorship",
  "Fitness & Wellness",
];

const goals = [
  {
    title: "Sell Digital Products & eBooks",
    desc: "Deliver instant PDF downloads, templates, or courses directly to buyers.",
  },
  {
    title: "Automate Instagram & Facebook DMs",
    desc: "Send direct store product links whenever followers comment keywords.",
  },
  {
    title: "Full Unified Monetization Engine",
    desc: "Combine both automated social DMs and instant bio store checkouts.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { update } = useSession();
  const { triggerToast } = useUi();
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState("");
  const [primaryGoal, setPrimaryGoal] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.username) setUsername(data.username);
        if (data.onboardingCompleted) router.replace("/dashboard");
      });
  }, [router]);

  async function finish() {
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        primaryGoal,
        username,
        onboardingCompleted: true,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      triggerToast(data.error || "Could not save onboarding.");
      return;
    }
    await update({ username: data.username, onboardingCompleted: true });
    triggerToast("Onboarding complete! Welcome to your dashboard.");
    router.push("/dashboard");
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="glass-card w-full max-w-xl space-y-6 rounded-3xl border border-slate-800 p-6 md:p-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-extrabold text-white">Setup Your Creator Bio Store</h2>
            <p className="text-xs text-slate-400">Step {step} of 3</p>
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={`h-2 w-8 rounded-full ${step >= n ? "bg-brand-500" : "bg-dark-800"}`}
              />
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-200">What is your primary content niche?</h3>
            <div className="grid grid-cols-2 gap-3">
              {niches.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left text-xs font-bold transition ${
                    category === cat
                      ? "border-brand-500 bg-brand-600/20 text-white"
                      : "border-slate-800 bg-dark-900 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <i className="fa-solid fa-circle-dot text-brand-500" />
                  <span>{cat}</span>
                </button>
              ))}
            </div>
            <button
              disabled={!category}
              onClick={() => setStep(2)}
              className="mt-4 w-full rounded-xl bg-brand-600 py-3 text-xs font-bold text-white transition hover:bg-brand-500 disabled:opacity-50"
            >
              Next Step →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-200">What is your primary monetization goal?</h3>
            <div className="space-y-2.5">
              {goals.map((goal) => (
                <button
                  key={goal.title}
                  type="button"
                  onClick={() => setPrimaryGoal(goal.title)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    primaryGoal === goal.title
                      ? "border-brand-500 bg-brand-600/20"
                      : "border-slate-800 bg-dark-900 hover:border-slate-700"
                  }`}
                >
                  <h4 className="text-xs font-bold text-white">{goal.title}</h4>
                  <p className="mt-1 text-[11px] text-slate-400">{goal.desc}</p>
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="w-1/3 rounded-xl bg-dark-800 py-3 text-xs font-bold text-slate-300"
              >
                Back
              </button>
              <button
                disabled={!primaryGoal}
                onClick={() => setStep(3)}
                className="w-2/3 rounded-xl bg-brand-600 py-3 text-xs font-bold text-white hover:bg-brand-500 disabled:opacity-50"
              >
                Next Step →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-200">Claim your custom bio-store URL handle</h3>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Custom Subdomain Link</label>
              <div className="flex items-center rounded-xl border border-slate-800 bg-dark-900 px-3 py-2.5 text-xs">
                <span className="font-bold text-slate-500">omniflow.bio/</span>
                <input
                  type="text"
                  placeholder="yourhandle"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="ml-1 flex-1 bg-transparent font-bold text-brand-400 focus:outline-none"
                />
              </div>
            </div>
            <button
              onClick={finish}
              disabled={saving || !username}
              className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? "Saving..." : "🚀 Enter Dashboard Studio"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
