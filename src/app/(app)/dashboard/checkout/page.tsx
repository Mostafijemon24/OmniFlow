"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUi } from "@/components/providers/ui-provider";

type Options = {
  plan: { id: string; name: string; priceUsd: number; tagline: string; features: string[] };
  stripe: boolean;
  bkash: boolean;
  bkashNumber: string | null;
  bkashInstructions: string | null;
  bkashAmountCents: number | null;
  currentPlan: string;
};

export default function PlanCheckoutPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { triggerToast } = useUi();
  const planId = params.get("plan") || "pro";

  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ trxId: "", senderNumber: "" });

  const load = useCallback(async () => {
    const res = await fetch(`/api/billing/options?plan=${encodeURIComponent(planId)}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "That plan does not exist.");
      return;
    }
    setOptions(data);
  }, [planId]);

  useEffect(() => {
    load();
    if (params.get("canceled")) triggerToast("Card payment was cancelled.");
  }, [load, params, triggerToast]);

  async function payWithCard() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not start the payment.");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      triggerToast("Your subscription was switched.");
      router.push("/dashboard/billing");
    } catch {
      setError("Could not reach the billing service.");
    } finally {
      setBusy(false);
    }
  }

  async function submitManual() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/payments/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, ...form }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not submit that payment.");
        return;
      }
      triggerToast("Payment submitted. We will activate your plan once it is verified.");
      router.push("/dashboard/billing");
    } catch {
      setError("Could not reach the billing service.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !options) {
    return <p className="text-xs text-red-400">{error}</p>;
  }
  if (!options) return null;

  const { plan } = options;
  const nothingAvailable = !options.stripe && !options.bkash;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/dashboard/plans" className="text-[11px] font-bold text-slate-400 hover:text-white">
        ← All plans
      </Link>

      <div className="glass-card rounded-2xl border border-slate-800 p-5">
        <h2 className="text-sm font-black text-white">
          {plan.name} · ${plan.priceUsd}/month
        </h2>
        <p className="mt-1 text-xs text-slate-400">{plan.tagline}</p>
        <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
          {plan.features.map((feature) => (
            <li key={feature}>
              <i className="fa-solid fa-check mr-2 text-emerald-400" />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      {nothingAvailable && (
        <div className="glass-card rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <p className="text-xs font-bold text-amber-300">No payment method is available yet.</p>
          <p className="mt-1 text-[11px] text-amber-300/80">
            The platform administrator has not finished setting up payments, so plans cannot be
            bought right now. Your account keeps working on its current limits in the meantime.
          </p>
        </div>
      )}

      {options.stripe && (
        <div className="glass-card space-y-3 rounded-2xl border border-slate-800 p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">Pay by card</h3>
          <p className="text-[11px] text-slate-400">
            Billed monthly through Stripe and renews automatically. Cancel any time.
          </p>
          <button
            onClick={payWithCard}
            disabled={busy}
            className="w-full rounded-xl bg-brand-600 py-3 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy ? "Please wait…" : `Pay $${plan.priceUsd} with card`}
          </button>
        </div>
      )}

      {options.bkash && (
        <div className="glass-card space-y-3 rounded-2xl border border-slate-800 p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">Pay with bKash</h3>

          <div className="rounded-xl border border-slate-800 bg-dark-950 p-3 text-xs">
            <p className="text-slate-400">
              Send{" "}
              <b className="text-emerald-400">
                BDT {((options.bkashAmountCents ?? 0) / 100).toFixed(2)}
              </b>{" "}
              to
            </p>
            <p className="mt-1 font-mono text-base font-black text-white">{options.bkashNumber}</p>
            {options.bkashInstructions && (
              <p className="mt-2 whitespace-pre-line text-[11px] text-slate-400">
                {options.bkashInstructions}
              </p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-400">
                bKash transaction ID
              </span>
              <input
                value={form.trxId}
                onChange={(e) => setForm({ ...form, trxId: e.target.value })}
                placeholder="8N7A1B2C3D"
                className="w-full rounded-xl border border-slate-800 bg-dark-950 px-3 py-2 text-xs uppercase text-white focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-400">
                Number you sent from
              </span>
              <input
                value={form.senderNumber}
                onChange={(e) => setForm({ ...form, senderNumber: e.target.value })}
                placeholder="01XXXXXXXXX"
                className="w-full rounded-xl border border-slate-800 bg-dark-950 px-3 py-2 text-xs text-white focus:outline-none"
              />
            </label>
          </div>

          <button
            onClick={submitManual}
            disabled={busy || form.trxId.length < 6 || form.senderNumber.length < 11}
            className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy ? "Submitting…" : "I have sent the money"}
          </button>
          <p className="text-[10px] text-slate-500">
            Your plan activates once we match the transaction ID against our bKash account. This is
            checked by a person, so it is not instant. bKash plans last 30 days and do not renew on
            their own.
          </p>
        </div>
      )}

      {error && <p className="text-xs font-semibold text-red-400">{error}</p>}
    </div>
  );
}
