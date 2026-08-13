"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MetaAccount } from "@/lib/types";
import { useUi } from "@/components/providers/ui-provider";

type PaymentSettings = {
  stripeConnected: boolean;
  bkashConnected: boolean;
  bkashSandbox: boolean;
  emailConfigured: boolean;
};

export default function IntegrationsPage() {
  const { triggerToast } = useUi();
  const params = useSearchParams();
  const [configured, setConfigured] = useState(true);
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [stripeKey, setStripeKey] = useState("");
  const [bkash, setBkash] = useState({
    bkashAppKey: "",
    bkashAppSecret: "",
    bkashUsername: "",
    bkashPassword: "",
    bkashSandbox: true,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [meta, pay] = await Promise.all([
      fetch("/api/meta/accounts").then((r) => r.json()),
      fetch("/api/settings/payments").then((r) => r.json()),
    ]);
    setConfigured(Boolean(meta.configured));
    setAccounts(meta.accounts || []);
    setSettings(pay);
    setBkash((b) => ({ ...b, bkashSandbox: pay.bkashSandbox ?? true }));
  }, []);

  useEffect(() => {
    load();
    setWebhookUrl(`${window.location.origin}/api/webhooks/meta`);
    const connected = params.get("meta_connected");
    const error = params.get("meta_error");
    if (connected) triggerToast(`Connected ${connected} Meta page(s).`);
    if (error) triggerToast(error);
  }, [load, params, triggerToast]);

  async function subscribe(account: MetaAccount) {
    const res = await fetch(`/api/meta/accounts/${account.id}`, { method: "POST" });
    const data = await res.json();
    triggerToast(res.ok ? `${account.pageName} is now receiving comment webhooks.` : data.error);
    load();
  }

  async function disconnect(account: MetaAccount) {
    const res = await fetch(`/api/meta/accounts/${account.id}`, { method: "DELETE" });
    if (!res.ok) {
      triggerToast(`${account.pageName} could not be disconnected.`);
      return;
    }
    triggerToast(`${account.pageName} disconnected.`);
    load();
  }

  async function savePayments(payload: Record<string, unknown>) {
    setSaving(true);
    const res = await fetch("/api/settings/payments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    triggerToast(res.ok ? "Payment settings saved." : data.error);
    if (res.ok) {
      setStripeKey("");
      setBkash({
        bkashAppKey: "",
        bkashAppSecret: "",
        bkashUsername: "",
        bkashPassword: "",
        bkashSandbox: bkash.bkashSandbox,
      });
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="glass-card space-y-4 rounded-2xl border border-slate-800 p-5">
        <h3 className="flex items-center justify-between border-b border-slate-800 pb-2.5 text-xs font-bold uppercase tracking-wider text-white">
          <span>Instagram & Facebook</span>
          <i className="fa-brands fa-meta text-brand-400" />
        </h3>

        {!configured ? (
          <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-300">
            <p className="font-bold">Meta app credentials are missing.</p>
            <p>
              Set <code>META_APP_ID</code>, <code>META_APP_SECRET</code> and{" "}
              <code>META_VERIFY_TOKEN</code> in your environment, then add this callback URL in the
              Meta developer console:
            </p>
            <code className="block break-all rounded bg-dark-950 p-2 text-[11px] text-slate-300">
              {webhookUrl.replace("/webhooks/meta", "/meta/oauth/callback")}
            </code>
          </div>
        ) : (
          <a
            href="/api/meta/oauth/start"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-500"
          >
            <i className="fa-solid fa-plug" /> Connect a page
          </a>
        )}

        <div className="space-y-2">
          {accounts.length === 0 && (
            <p className="text-xs text-slate-400">No pages connected yet.</p>
          )}
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-dark-900 p-3"
            >
              <div>
                <p className="text-xs font-bold text-white">{account.pageName}</p>
                <p className="text-[10px] text-slate-500">
                  {account.platform} · page {account.pageId}
                  {account.igUserId ? ` · IG ${account.igUserId}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                    account.subscribed
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-amber-500/20 text-amber-400"
                  }`}
                >
                  {account.subscribed ? "LIVE" : "NOT SUBSCRIBED"}
                </span>
                {!account.subscribed && (
                  <button
                    onClick={() => subscribe(account)}
                    className="rounded-lg bg-brand-600 px-2.5 py-1 text-[10px] font-bold text-white"
                  >
                    Subscribe
                  </button>
                )}
                <button
                  onClick={() => disconnect(account)}
                  className="text-xs text-slate-500 hover:text-red-400"
                >
                  <i className="fa-solid fa-trash" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-800 bg-dark-950 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Webhook callback URL
          </p>
          <code className="break-all text-[11px] text-slate-300">{webhookUrl}</code>
        </div>
      </div>

      <div className="glass-card space-y-4 rounded-2xl border border-slate-800 p-5">
        <h3 className="border-b border-slate-800 pb-2.5 text-xs font-bold uppercase tracking-wider text-white">
          Payment gateways
        </h3>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-dark-900 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">Stripe</span>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                settings?.stripeConnected
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-slate-700 text-slate-300"
              }`}
            >
              {settings?.stripeConnected ? "CONNECTED" : "NOT CONNECTED"}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="sk_live_..."
              value={stripeKey}
              onChange={(e) => setStripeKey(e.target.value)}
              className="flex-1 rounded-xl border border-slate-800 bg-dark-950 px-3 py-2 text-xs text-white focus:outline-none"
            />
            <button
              onClick={() => savePayments({ stripeSecretKey: stripeKey })}
              disabled={saving || !stripeKey}
              className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              Verify & save
            </button>
          </div>
          <p className="text-[10px] text-slate-500">
            The key is validated against Stripe, then encrypted before storage.
          </p>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-dark-900 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">bKash (tokenized checkout)</span>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                settings?.bkashConnected
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-slate-700 text-slate-300"
              }`}
            >
              {settings?.bkashConnected ? "CONNECTED" : "NOT CONNECTED"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["bkashAppKey", "App key"],
                ["bkashAppSecret", "App secret"],
                ["bkashUsername", "Username"],
                ["bkashPassword", "Password"],
              ] as const
            ).map(([field, label]) => (
              <input
                key={field}
                type={field.includes("Secret") || field.includes("Password") ? "password" : "text"}
                placeholder={label}
                value={bkash[field]}
                onChange={(e) => setBkash({ ...bkash, [field]: e.target.value })}
                className="rounded-xl border border-slate-800 bg-dark-950 px-3 py-2 text-xs text-white focus:outline-none"
              />
            ))}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={bkash.bkashSandbox}
              onChange={(e) => setBkash({ ...bkash, bkashSandbox: e.target.checked })}
              className="accent-brand-500"
            />
            Use sandbox environment
          </label>
          <button
            onClick={() => savePayments(bkash)}
            disabled={saving}
            className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            Save bKash credentials
          </button>
          <p className="text-[10px] text-slate-500">bKash charges in BDT (৳) only.</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-dark-900 p-4 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">Email delivery (Resend)</span>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                settings?.emailConfigured
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-amber-500/20 text-amber-400"
              }`}
            >
              {settings?.emailConfigured ? "CONFIGURED" : "SET RESEND_API_KEY"}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            Without it, orders still complete and download links stay available from the CRM, but no
            email is sent.
          </p>
        </div>
      </div>
    </div>
  );
}
