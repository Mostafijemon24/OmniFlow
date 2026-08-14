"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AutoRule, MetaAccount, Product } from "@/lib/types";
import { useUi } from "@/components/providers/ui-provider";

type SimResult = {
  rule: { keyword: string; platform: string; autoMessage: string };
  link: string;
  liveReady: boolean;
  warning: string | null;
};

export default function AutoDmPage() {
  const { triggerToast } = useUi();
  const [products, setProducts] = useState<Product[]>([]);
  const [rules, setRules] = useState<AutoRule[]>([]);
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [form, setForm] = useState({
    platform: "facebook",
    keyword: "",
    targetProductId: "",
    autoMessage: "",
    metaAccountId: "",
  });
  const [comment, setComment] = useState("");
  const [sim, setSim] = useState<SimResult | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [prods, ruleRows, meta] = await Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/auto-dm").then((r) => r.json()),
      fetch("/api/meta/accounts").then((r) => r.json()),
    ]);
    const list: Product[] = Array.isArray(prods) ? prods : [];
    setProducts(list);
    setRules(Array.isArray(ruleRows) ? ruleRows : []);
    setAccounts(meta.accounts || []);
    setForm((f) => ({ ...f, targetProductId: f.targetProductId || list[0]?.id || "" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addRule(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/auto-dm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, metaAccountId: form.metaAccountId || undefined }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      triggerToast(data.error || "Could not activate rule.");
      return;
    }
    setForm({ ...form, keyword: "", autoMessage: "" });
    triggerToast(`Keyword ${data.keyword} is now live.`);
    load();
  }

  async function toggleRule(rule: AutoRule) {
    const res = await fetch(`/api/auto-dm/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !rule.active }),
    });
    if (!res.ok) {
      triggerToast(`Could not ${rule.active ? "pause" : "resume"} ${rule.keyword}.`);
      return;
    }
    load();
  }

  async function deleteRule(rule: AutoRule) {
    const res = await fetch(`/api/auto-dm/${rule.id}`, { method: "DELETE" });
    if (!res.ok) {
      triggerToast(`Could not remove ${rule.keyword}.`);
      return;
    }
    triggerToast(`Rule ${rule.keyword} removed.`);
    load();
  }

  async function simulate() {
    if (!comment.trim()) return;
    const res = await fetch("/api/auto-dm/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    if (!res?.ok || !data) {
      triggerToast(data?.error || "The matcher could not be reached.");
      return;
    }
    setComment("");
    if (!data.matched) {
      setSim(null);
      triggerToast("No active keyword matched that comment.");
      return;
    }
    setSim(data);
  }

  const noProducts = products.length === 0;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-5 xl:col-span-7">
        {accounts.length === 0 && (
          <div className="glass-card rounded-2xl border border-amber-500/30 p-4 text-xs text-amber-300">
            <i className="fa-solid fa-triangle-exclamation mr-2" />
            No Meta page connected yet, so rules will not fire on real comments.{" "}
            <Link href="/dashboard/connections" className="font-bold underline">
              Connect Instagram / Facebook
            </Link>
          </div>
        )}

        <div className="glass-card space-y-4 rounded-2xl border border-slate-800 p-5">
          <h3 className="flex items-center gap-2 border-b border-slate-800 pb-2.5 text-xs font-bold uppercase tracking-wider text-white">
            <i className="fa-solid fa-wand-magic-sparkles text-pink-400" /> Keyword Comment-to-DM Setup
          </h3>

          {noProducts ? (
            <p className="text-xs text-slate-400">
              Add a product first — every rule must point to something buyers can purchase.
            </p>
          ) : (
            <form onSubmit={addRule} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-400">Social Network</label>
                  <select
                    value={form.platform}
                    onChange={(e) => setForm({ ...form, platform: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="facebook">Facebook Page Feed</option>
                    <option value="instagram">Instagram Posts / Reels</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-400">Trigger Keyword</label>
                  <input
                    placeholder="#KIT"
                    value={form.keyword}
                    onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-1.5 text-xs font-bold uppercase text-brand-400 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-400">Target Product</label>
                  <select
                    value={form.targetProductId}
                    onChange={(e) => setForm({ ...form, targetProductId: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-1.5 text-xs font-bold text-emerald-400 focus:outline-none"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.currency}
                        {p.price})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-400">Connected Page</label>
                  <select
                    value={form.metaAccountId}
                    onChange={(e) => setForm({ ...form, metaAccountId: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="">Any connected page</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.pageName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-400">Auto-DM Message</label>
                <textarea
                  rows={2}
                  placeholder="Thanks for commenting! Here is your checkout link:"
                  value={form.autoMessage}
                  onChange={(e) => setForm({ ...form, autoMessage: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-1.5 text-xs text-white focus:outline-none"
                  required
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  The product checkout link is appended automatically.
                </p>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white shadow-lg transition hover:bg-brand-500 disabled:opacity-60"
              >
                {saving ? "Activating..." : "Activate Auto-DM Rule"}
              </button>
            </form>
          )}
        </div>

        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="glass-card space-y-2 rounded-2xl border border-slate-800 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      rule.platform === "facebook"
                        ? "bg-blue-600/20 text-blue-400"
                        : "bg-pink-600/20 text-pink-400"
                    }`}
                  >
                    {rule.platform}
                  </span>
                  <span className="rounded border border-brand-500/20 bg-brand-500/10 px-2 py-0.5 text-xs font-black text-brand-400">
                    {rule.keyword}
                  </span>
                  {!rule.active && (
                    <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[9px] font-bold text-slate-300">
                      PAUSED
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-400">
                    Sent: <b className="text-white">{rule.triggerCount}</b>
                  </span>
                  <button
                    onClick={() => toggleRule(rule)}
                    className="text-xs text-slate-400 hover:text-white"
                    title={rule.active ? "Pause" : "Resume"}
                  >
                    <i className={`fa-solid ${rule.active ? "fa-pause" : "fa-play"}`} />
                  </button>
                  <button
                    onClick={() => deleteRule(rule)}
                    className="text-xs text-slate-500 hover:text-red-400"
                  >
                    <i className="fa-solid fa-trash" />
                  </button>
                </div>
              </div>
              <p className="rounded-xl bg-dark-900 p-2 text-xs text-slate-300">{rule.autoMessage}</p>
              <p className="text-[10px] text-slate-500">
                → {rule.targetProduct?.title}
                {rule.metaAccount ? ` · ${rule.metaAccount.pageName}` : " · any connected page"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 xl:col-span-5">
        <div className="glass-card space-y-3 rounded-2xl border border-pink-500/30 p-5">
          <h3 className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-white">
            <span>Keyword Matcher Testbench</span>
            <span className="rounded bg-pink-500/20 px-2 py-0.5 text-[9px] font-bold text-pink-400">DRY RUN</span>
          </h3>

          <div className="space-y-2.5 rounded-xl border border-slate-800 bg-dark-900 p-3.5">
            <p className="text-xs text-slate-200">
              Test how a real comment resolves against your live rules. No DM is sent and analytics
              stay untouched.
            </p>
            <div className="flex gap-2">
              <input
                placeholder="Type a comment..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && simulate()}
                className="flex-1 rounded-xl border border-slate-700 bg-dark-950 px-3 py-1.5 text-xs text-white focus:outline-none"
              />
              <button onClick={simulate} className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-bold text-white">
                Match
              </button>
            </div>
          </div>

          {sim && (
            <div className="space-y-2 rounded-2xl border border-brand-500 bg-gradient-to-r from-indigo-950 to-slate-900 p-3.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400">
                <span>Matched {sim.rule.keyword}</span>
                <button onClick={() => setSim(null)} className="text-slate-400">✕</button>
              </div>
              <p className="text-xs text-slate-200">{sim.rule.autoMessage}</p>
              <a href={sim.link} target="_blank" rel="noreferrer" className="block break-all text-xs font-bold text-brand-400 underline">
                {sim.link}
              </a>
              {sim.warning && <p className="text-[10px] text-amber-400">{sim.warning}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
