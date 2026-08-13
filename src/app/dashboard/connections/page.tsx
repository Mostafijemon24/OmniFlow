"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MetaAccount } from "@/lib/types";
import { useUi } from "@/components/providers/ui-provider";

export default function ConnectionsPage() {
  const { triggerToast } = useUi();
  const params = useSearchParams();
  const [configured, setConfigured] = useState(true);
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/meta/accounts");
    const data = await res.json();
    setConfigured(Boolean(data.configured));
    setAccounts(data.accounts || []);
  }, []);

  useEffect(() => {
    load();
    const connected = params.get("meta_connected");
    const skipped = params.get("meta_skipped");
    const error = params.get("meta_error");
    if (connected) {
      triggerToast(
        `Connected ${connected} page(s).${skipped ? ` ${skipped} already belong to another account.` : ""}`
      );
    }
    if (error) triggerToast(error);
  }, [load, params, triggerToast]);

  async function subscribe(account: MetaAccount) {
    setBusy(account.id);
    const res = await fetch(`/api/meta/accounts/${account.id}`, { method: "POST" });
    const data = await res.json();
    setBusy(null);
    triggerToast(res.ok ? `${account.pageName} is now receiving comment webhooks.` : data.error);
    load();
  }

  async function disconnect(account: MetaAccount) {
    setBusy(account.id);
    await fetch(`/api/meta/accounts/${account.id}`, { method: "DELETE" });
    setBusy(null);
    triggerToast(`${account.pageName} disconnected.`);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="glass-card space-y-4 rounded-2xl border border-slate-800 p-5">
        <h3 className="flex items-center justify-between border-b border-slate-800 pb-2.5 text-xs font-bold uppercase tracking-wider text-white">
          <span>Instagram &amp; Facebook pages</span>
          <i className="fa-brands fa-meta text-brand-400" />
        </h3>

        <p className="text-xs text-slate-400">
          Connect the page whose comments should trigger your Auto-DM rules. Pages you connect stay
          yours: rules, quotas and analytics all follow your account.
        </p>

        {!configured ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-300">
            <p className="font-bold">Instagram and Facebook are not available yet.</p>
            <p className="mt-1 text-amber-300/80">
              The platform administrator has not finished setting up the Meta connector. Auto-DM
              rules can still be written and tested in the meantime — they will start firing on real
              comments as soon as a page is connected.
            </p>
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
          {configured && accounts.length === 0 && (
            <p className="text-xs text-slate-400">No pages connected yet.</p>
          )}
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-dark-900 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white">{account.pageName}</p>
                <p className="truncate text-[10px] text-slate-500">
                  {account.platform} · page {account.pageId}
                  {account.igUserId ? ` · IG ${account.igUserId}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {account.needsReconnect ? (
                  <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                    RECONNECT NEEDED
                  </span>
                ) : (
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      account.subscribed
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {account.subscribed ? "LIVE" : "NOT SUBSCRIBED"}
                  </span>
                )}
                {!account.subscribed && !account.needsReconnect && (
                  <button
                    onClick={() => subscribe(account)}
                    disabled={busy === account.id}
                    className="rounded-lg bg-brand-600 px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                  >
                    Subscribe
                  </button>
                )}
                <button
                  onClick={() => disconnect(account)}
                  disabled={busy === account.id}
                  className="text-xs text-slate-500 hover:text-red-400 disabled:opacity-50"
                  aria-label={`Disconnect ${account.pageName}`}
                >
                  <i className="fa-solid fa-trash" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {accounts.some((a) => a.needsReconnect) && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-300">
            The platform&apos;s Meta app credentials changed, so the stored access tokens no longer
            work. Disconnect and connect the page again to restore Auto-DM delivery.
          </p>
        )}
      </div>
    </div>
  );
}
