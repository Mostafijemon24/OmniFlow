"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUi } from "@/components/providers/ui-provider";
import { parseRate } from "@/lib/digits";

type Settings = {
  stripe: {
    enabled: boolean;
    secretKeySet: boolean;
    priceStarter: string;
    pricePro: string;
    priceAgency: string;
    webhookSecretSet: boolean;
  };
  bkash: {
    enabled: boolean;
    number: string;
    instructions: string;
    usdRate: number | null;
  };
  meta: {
    enabled: boolean;
    appId: string;
    appSecretSet: boolean;
    verifyTokenSet: boolean;
    graphVersion: string;
    connectedPages: number;
  };
  email: { configured: boolean };
  urls: Record<string, string>;
  storePaymentsEnabled: boolean;
};

function Status({ ok, on, off }: { ok: boolean; on: string; off: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
        ok ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700 text-slate-300"
      }`}
    >
      {ok ? on : off}
    </span>
  );
}

function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-slate-400">{label}</span>
      <input
        {...input}
        className="w-full rounded-xl border border-slate-800 bg-dark-950 px-3 py-2 text-xs text-white focus:border-brand-500 focus:outline-none"
      />
      {hint && <span className="mt-1 block text-[10px] text-slate-500">{hint}</span>}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-brand-500"
      />
      {label}
    </label>
  );
}

export default function AdminSettingsPage() {
  const { triggerToast } = useUi();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const [stripeKey, setStripeKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [prices, setPrices] = useState({ starter: "", pro: "", agency: "" });
  const [bkash, setBkash] = useState({ number: "", instructions: "", usdRate: "" });
  const [meta, setMeta] = useState({ appId: "", appSecret: "", verifyToken: "", graphVersion: "" });

  const applySettings = useCallback((data: Settings) => {
    setSettings(data);
    setPrices({
      starter: data.stripe.priceStarter,
      pro: data.stripe.pricePro,
      agency: data.stripe.priceAgency,
    });
    setBkash({
      number: data.bkash.number,
      instructions: data.bkash.instructions,
      usdRate: data.bkash.usdRate != null && Number(data.bkash.usdRate) > 0 ? String(data.bkash.usdRate) : "",
    });
    setMeta((m) => ({
      ...m,
      appId: data.meta.appId,
      graphVersion: data.meta.graphVersion,
      appSecret: "",
      verifyToken: "",
    }));
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/settings");
    if (!res.ok) return;
    applySettings(await res.json());
  }, [applySettings]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (payload: Record<string, unknown>, successMessage: string) => {
      setSaving(true);
      try {
        const res = await fetch("/api/admin/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          triggerToast(
            res.status === 404
              ? "Session expired. Sign out, sign in, then save again."
              : data.error || "Could not save the setting."
          );
          return;
        }
        triggerToast(
          data.flaggedPages
            ? `${successMessage} ${data.flaggedPages} connected page(s) now need reconnecting.`
            : successMessage
        );
        setStripeKey("");
        setWebhookSecret("");
        if (data.bkash) applySettings(data as Settings);
        else await load();
      } catch {
        triggerToast("Could not reach the server.");
      } finally {
        setSaving(false);
      }
    },
    [applySettings, load, triggerToast]
  );

  if (!settings) return null;

  const stripeReady = settings.stripe.enabled && settings.stripe.secretKeySet;
  const bkashReady =
    settings.bkash.enabled &&
    Boolean(settings.bkash.number.trim()) &&
    Number(settings.bkash.usdRate) > 0;
  const metaReady = settings.meta.enabled && Boolean(settings.meta.appId) && settings.meta.appSecretSet;

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl border border-brand-500/30 bg-brand-600/5 p-5">
        <h2 className="text-sm font-black text-white">Platform setup</h2>
        <p className="mt-1 text-xs text-slate-400">
          These settings apply to the whole platform and are only visible to the super admin.
          Creators never see or edit them.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Status ok={stripeReady} on="STRIPE LIVE" off="STRIPE OFF" />
          <Status ok={bkashReady} on="BKASH LIVE" off="BKASH OFF" />
          <Status ok={metaReady} on="META LIVE" off="META OFF" />
          <Status ok={settings.email.configured} on="EMAIL ON" off="EMAIL OFF" />
        </div>
        {!stripeReady && !bkashReady && (
          <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-300">
            {settings.bkash.number || Number(settings.bkash.usdRate) > 0
              ? "bKash details are filled, but the gateway is not live yet. Click Save bKash details — that also turns bKash on."
              : "No payment gateway is live, so creators cannot buy a paid plan yet. Configure and enable Stripe or bKash below."}
          </p>
        )}
        <Link
          href="/dashboard/admin/payments"
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-dark-900 px-3 py-2 text-[11px] font-bold text-slate-200 hover:bg-dark-800"
        >
          <i className="fa-solid fa-receipt text-brand-400" /> Manual payment queue
        </Link>
      </div>

      {/* ---------------------------------------------------------------- */}
      <section className="glass-card space-y-4 rounded-2xl border border-slate-800 p-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            Stripe — card payments for plans
          </h3>
          <Status ok={settings.stripe.secretKeySet} on="KEY SAVED" off="NO KEY" />
        </div>

        <Toggle
          checked={settings.stripe.enabled}
          onChange={(v) => save({ stripeEnabled: v }, v ? "Stripe enabled." : "Stripe disabled.")}
          label="Offer Stripe at checkout"
        />

        <div className="flex gap-2">
          <input
            type="password"
            placeholder={settings.stripe.secretKeySet ? "sk_live_… (replace)" : "sk_live_…"}
            value={stripeKey}
            onChange={(e) => setStripeKey(e.target.value)}
            className="flex-1 rounded-xl border border-slate-800 bg-dark-950 px-3 py-2 text-xs text-white focus:outline-none"
          />
          <button
            onClick={() => save({ stripeSecretKey: stripeKey }, "Stripe key verified and saved.")}
            disabled={saving || !stripeKey}
            className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            Verify &amp; save
          </button>
        </div>
        <p className="text-[10px] text-slate-500">
          The key is checked against Stripe before it is encrypted and stored.
        </p>

        <div className="grid gap-3 md:grid-cols-3">
          <Field
            label="Starter price ID"
            placeholder="price_1ABC…"
            value={prices.starter}
            onChange={(e) => setPrices({ ...prices, starter: e.target.value })}
          />
          <Field
            label="Pro price ID"
            placeholder="price_1ABC…"
            value={prices.pro}
            onChange={(e) => setPrices({ ...prices, pro: e.target.value })}
          />
          <Field
            label="Agency price ID"
            placeholder="price_1ABC…"
            value={prices.agency}
            onChange={(e) => setPrices({ ...prices, agency: e.target.value })}
          />
        </div>
        <button
          onClick={() =>
            save(
              {
                stripePriceStarter: prices.starter,
                stripePricePro: prices.pro,
                stripePriceAgency: prices.agency,
              },
              "Stripe price IDs saved."
            )
          }
          disabled={saving}
          className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          Save price IDs
        </button>
        <p className="text-[10px] text-slate-500">
          A plan without a Stripe Price ID cannot be bought with a card. Open Stripe Dashboard →
          Product → copy the ID that starts with price_. The plan amount (12, 26, 88) is not the ID.
        </p>

        <div className="rounded-xl border border-slate-800 bg-dark-950 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Webhook endpoint
            </span>
            <Status ok={settings.stripe.webhookSecretSet} on="SECRET SET" off="STRIPE_WEBHOOK_SECRET MISSING" />
          </div>
          <code className="break-all text-[11px] text-slate-300">{settings.urls.stripeWebhook}</code>
          <div className="mt-3 flex gap-2">
            <input
              type="password"
              placeholder={
                settings.stripe.webhookSecretSet ? "whsec_… (replace)" : "whsec_… from Stripe webhook"
              }
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              className="flex-1 rounded-xl border border-slate-800 bg-dark-950 px-3 py-2 text-xs text-white focus:outline-none"
            />
            <button
              onClick={() => save({ stripeWebhookSecret: webhookSecret }, "Stripe webhook secret saved.")}
              disabled={saving || !webhookSecret}
              className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              Save secret
            </button>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            Stripe Dashboard → Developers → Webhooks → add the URL above → copy the Signing secret
            (whsec_…).
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="glass-card space-y-4 rounded-2xl border border-slate-800 p-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            bKash — manual transfer, verified by you
          </h3>
          <Status ok={bkashReady} on="READY" off="INCOMPLETE" />
        </div>

        <Toggle
          checked={settings.bkash.enabled}
          onChange={(v) =>
            save(
              {
                bkashEnabled: v,
                bkashNumber: bkash.number,
                bkashInstructions: bkash.instructions,
                bkashUsdRate: parseRate(bkash.usdRate) || 0,
              },
              v ? "bKash enabled." : "bKash disabled."
            )
          }
          label="Offer bKash at checkout"
        />

        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="bKash number"
            placeholder="01XXXXXXXXX"
            value={bkash.number}
            onChange={(e) => setBkash({ ...bkash, number: e.target.value })}
          />
          <Field
            label="BDT per 1 USD"
            type="number"
            placeholder="120"
            hint="Plans are priced in USD. This converts them for bKash."
            value={bkash.usdRate}
            onChange={(e) => setBkash({ ...bkash, usdRate: e.target.value })}
          />
        </div>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-400">
            Instructions shown to the buyer
          </span>
          <textarea
            rows={3}
            value={bkash.instructions}
            onChange={(e) => setBkash({ ...bkash, instructions: e.target.value })}
            placeholder="Send Money to the number above, then paste the transaction ID here."
            className="w-full rounded-xl border border-slate-800 bg-dark-950 px-3 py-2 text-xs text-white focus:border-brand-500 focus:outline-none"
          />
        </label>
        <button
          onClick={() => {
            const rate = parseRate(bkash.usdRate);
            if (!bkash.number.trim() || !(rate > 0)) {
              triggerToast("Enter a bKash number and a BDT-per-USD rate greater than 0.");
              return;
            }
            save(
              {
                bkashEnabled: true,
                bkashNumber: bkash.number.trim(),
                bkashInstructions: bkash.instructions,
                bkashUsdRate: rate,
              },
              "bKash is on."
            );
          }}
          disabled={saving}
          className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          Save &amp; turn bKash on
        </button>
        <p className="text-[10px] text-slate-500">
          Every bKash payment waits in the queue until you verify the transaction ID against your
          bKash statement and approve it. Nothing is verified automatically.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="glass-card space-y-4 rounded-2xl border border-slate-800 p-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            Meta connector — Facebook login &amp; page access
          </h3>
          <Status ok={metaReady} on="READY" off="INCOMPLETE" />
        </div>

        <Toggle
          checked={settings.meta.enabled}
          onChange={(v) =>
            save({ metaEnabled: v }, v ? "Meta connector enabled." : "Meta connector disabled.")
          }
          label="Enable Facebook login and page connections"
        />

        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="App ID"
            value={meta.appId}
            onChange={(e) => setMeta({ ...meta, appId: e.target.value })}
          />
          <Field
            label="Graph version"
            placeholder="v21.0"
            value={meta.graphVersion}
            onChange={(e) => setMeta({ ...meta, graphVersion: e.target.value })}
          />
          <Field
            label="App secret"
            type="password"
            placeholder={settings.meta.appSecretSet ? "saved — enter to replace" : "app secret"}
            value={meta.appSecret}
            onChange={(e) => setMeta({ ...meta, appSecret: e.target.value })}
          />
          <Field
            label="Webhook verify token"
            type="password"
            placeholder={settings.meta.verifyTokenSet ? "saved — enter to replace" : "any random string"}
            value={meta.verifyToken}
            onChange={(e) => setMeta({ ...meta, verifyToken: e.target.value })}
          />
        </div>

        {settings.meta.connectedPages > 0 && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-300">
            {settings.meta.connectedPages} page(s) are connected with the current app. Changing the
            App ID invalidates their stored tokens and every owner will have to reconnect.
          </p>
        )}

        <button
          onClick={() =>
            save(
              {
                metaAppId: meta.appId,
                metaGraphVersion: meta.graphVersion || "v21.0",
                ...(meta.appSecret ? { metaAppSecret: meta.appSecret } : {}),
                ...(meta.verifyToken ? { metaVerifyToken: meta.verifyToken } : {}),
              },
              "Meta connector saved."
            )
          }
          disabled={saving}
          className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          Save connector
        </button>

        <div className="space-y-2 rounded-xl border border-slate-800 bg-dark-950 p-3 text-[11px]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Register these URLs in the Meta developer console
          </p>
          {[
            ["OAuth redirect (pages)", settings.urls.metaOauthCallback],
            ["OAuth redirect (login)", settings.urls.facebookLoginCallback],
            ["Webhook callback", settings.urls.metaWebhook],
          ].map(([label, url]) => (
            <div key={label}>
              <span className="text-slate-500">{label}</span>
              <code className="block break-all text-slate-300">{url}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-card rounded-2xl border border-slate-800 p-5">
        <h3 className="border-b border-slate-800 pb-2.5 text-xs font-bold uppercase tracking-wider text-white">
          Creator store payments
        </h3>
        <Toggle
          checked={settings.storePaymentsEnabled}
          onChange={(v) =>
            save(
              { storePaymentsEnabled: v },
              v ? "Store checkout is on." : "Store checkout is off."
            )
          }
          label="Let buyers pay for products on public stores using Stripe / bKash"
        />
        <p className="mt-3 text-xs text-slate-400">
          Turn this on after Stripe or bKash is live. Paid products then use the same gateways as
          plan checkout. Free products still deliver without payment.
        </p>
      </section>
    </div>
  );
}
