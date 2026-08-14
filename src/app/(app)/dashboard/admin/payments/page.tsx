"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUi } from "@/components/providers/ui-provider";

type Payment = {
  id: string;
  plan: string | null;
  trxId: string;
  senderNumber: string;
  amountCents: number;
  currency: string;
  status: string;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  user: {
    email: string;
    fullName: string;
    username: string;
    plan: string;
    planStatus: string;
    planPeriodEnd: string | null;
    notice: { level: string; message: string } | null;
  } | null;
};

const TABS = ["PENDING", "APPROVED", "REJECTED"];

export default function AdminPaymentsPage() {
  const { triggerToast } = useUi();
  const [tab, setTab] = useState("PENDING");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    const res = await fetch(`/api/admin/payments?status=${status}`);
    if (res.ok) {
      const data = await res.json();
      setPayments(data.payments);
      setPendingCount(data.pendingCount);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(tab);
  }, [load, tab]);

  async function review(payment: Payment, action: "approve" | "reject") {
    const note =
      action === "reject"
        ? window.prompt("Why is this being rejected? The creator will see this.") ?? ""
        : "";
    if (action === "reject" && !note) return;

    setBusy(payment.id);
    const res = await fetch(`/api/admin/payments/${payment.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note: note || undefined }),
    });
    const data = await res.json();
    setBusy(null);

    triggerToast(
      res.ok
        ? action === "approve"
          ? `Plan activated until ${new Date(data.planPeriodEnd).toDateString()}.`
          : "Payment rejected."
        : data.error || "Could not review that payment."
    );
    load(tab);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black text-white">Manual payment queue</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Check each transaction ID against your bKash statement before approving. Approving
            activates the plan for 30 days.
          </p>
        </div>
        <Link
          href="/dashboard/admin"
          className="shrink-0 rounded-xl border border-slate-800 bg-dark-900 px-3 py-2 text-[11px] font-bold text-slate-300 hover:bg-dark-800"
        >
          Platform setup
        </Link>
      </div>

      <div className="flex gap-2">
        {TABS.map((status) => (
          <button
            key={status}
            onClick={() => setTab(status)}
            className={`rounded-xl px-3 py-1.5 text-[11px] font-bold transition ${
              tab === status
                ? "bg-brand-600 text-white"
                : "border border-slate-800 bg-dark-900 text-slate-400 hover:text-white"
            }`}
          >
            {status}
            {status === "PENDING" && pendingCount > 0 && (
              <span className="ml-1.5 rounded bg-amber-500/30 px-1.5 text-[9px] text-amber-200">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {!loading && payments.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-xs text-slate-400">
          {tab === "PENDING"
            ? "Nothing waiting for review."
            : `No ${tab.toLowerCase()} payments yet.`}
        </p>
      )}

      <div className="space-y-3">
        {payments.map((p) => (
          <div key={p.id} className="glass-card rounded-2xl border border-slate-800 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-white">
                  {p.user?.fullName ?? "Deleted account"}{" "}
                  <span className="font-normal text-slate-500">{p.user?.email}</span>
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Wants <b className="text-brand-400">{p.plan}</b> · sent{" "}
                  <b className="text-emerald-400">
                    {p.currency} {(p.amountCents / 100).toFixed(2)}
                  </b>{" "}
                  from {p.senderNumber}
                </p>
                <p className="mt-1 font-mono text-[11px] text-slate-300">TrxID {p.trxId}</p>
                <p className="mt-1 text-[10px] text-slate-500">
                  Submitted {new Date(p.createdAt).toLocaleString()}
                  {p.reviewedAt &&
                    ` · reviewed by ${p.reviewedBy} on ${new Date(p.reviewedAt).toLocaleString()}`}
                </p>
                {p.reviewNote && (
                  <p className="mt-1 text-[11px] text-slate-400">Note: {p.reviewNote}</p>
                )}
                {p.user?.notice && (
                  <p
                    className={`mt-2 text-[11px] font-semibold ${
                      p.user.notice.level === "expired"
                        ? "text-red-400"
                        : p.user.notice.level === "expiring"
                          ? "text-amber-400"
                          : "text-slate-400"
                    }`}
                  >
                    {p.user.notice.message}
                  </p>
                )}
              </div>

              {p.status === "PENDING" ? (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => review(p, "approve")}
                    disabled={busy === p.id}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => review(p, "reject")}
                    disabled={busy === p.id}
                    className="rounded-xl border border-slate-700 px-3 py-2 text-[11px] font-bold text-slate-300 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              ) : (
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${
                    p.status === "APPROVED"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {p.status}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
