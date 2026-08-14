"use client";

import { useCallback, useEffect, useState } from "react";
import { CurrencyTotal, OrderRow } from "@/lib/types";
import { formatDateTime, formatRevenue, relativeTime } from "@/lib/format";
import { useUi } from "@/components/providers/ui-provider";
import { cachedJson, invalidateCache, peekCache } from "@/lib/client-cache";

const STATUSES = ["ALL", "PAID", "PENDING", "FAILED", "REFUNDED"];

function ordersKey(status: string, q: string) {
  const params = new URLSearchParams({ status });
  if (q) params.set("q", q);
  return `/api/orders?${params}`;
}

export default function OrdersPage() {
  const { triggerToast } = useUi();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [orders, setOrders] = useState<OrderRow[]>(() => {
    const data = peekCache<{ orders?: OrderRow[] }>(ordersKey("ALL", ""));
    return data?.orders ?? [];
  });
  const [revenue, setRevenue] = useState<CurrencyTotal[]>(() => {
    const data = peekCache<{ revenue?: CurrencyTotal[] }>(ordersKey("ALL", ""));
    return data?.revenue ?? [];
  });
  const [total, setTotal] = useState(() => {
    const data = peekCache<{ total?: number }>(ordersKey("ALL", ""));
    return data?.total ?? 0;
  });
  const [truncated, setTruncated] = useState(() => {
    const data = peekCache<{ truncated?: boolean }>(ordersKey("ALL", ""));
    return Boolean(data?.truncated);
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const url = ordersKey(status, q);

    try {
      const data = await cachedJson<{
        error?: string;
        orders?: OrderRow[];
        revenue?: CurrencyTotal[];
        total?: number;
        truncated?: boolean;
      }>(url);
      if (data.error && !data.orders) {
        setError(data.error);
        return;
      }
      setError("");
      setOrders(data.orders ?? []);
      setRevenue(data.revenue ?? []);
      setTotal(data.total ?? 0);
      setTruncated(Boolean(data.truncated));
    } catch {
      setError("Could not reach the orders service.");
    }
  }, [q, status]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function resend(order: OrderRow) {
    setBusy(order.id);
    const res = await fetch(`/api/orders/${order.id}/resend`, { method: "POST" });
    const data = await res.json();
    setBusy(null);
    triggerToast(
      res.ok ? `Delivery email re-sent to ${order.customerEmail}` : data.error || "Re-send failed."
    );
    invalidateCache("/api/orders");
    load();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <div className="glass-card rounded-2xl border border-slate-800 p-4">
          <span className="block text-[10px] font-bold uppercase text-slate-500">Paid revenue</span>
          <span className="text-2xl font-black text-emerald-400">{formatRevenue(revenue)}</span>
        </div>
        <div className="glass-card rounded-2xl border border-slate-800 p-4">
          <span className="block text-[10px] font-bold uppercase text-slate-500">Orders</span>
          <span className="text-2xl font-black text-white">{total}</span>
        </div>
        <div className="glass-card rounded-2xl border border-slate-800 p-4">
          <span className="block text-[10px] font-bold uppercase text-slate-500">Delivered</span>
          <span className="text-2xl font-black text-brand-400">
            {orders.filter((o) => o.deliveredAt).length}
          </span>
        </div>
      </div>

      <div className="glass-card space-y-4 rounded-2xl border border-slate-800 p-5">
        <div className="flex flex-col gap-3 border-b border-slate-800 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            Customer Order & Sales CRM
          </h3>
          <div className="flex gap-2">
            <input
              placeholder="Search name, email, product"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="rounded-xl border border-slate-800 bg-dark-900 px-3 py-1.5 text-xs text-white focus:outline-none"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-slate-800 bg-dark-900 px-2 py-1.5 text-xs text-white focus:outline-none"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <p className="py-8 text-center text-xs text-red-400">{error}</p>
        ) : orders.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">
            No orders match this view yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-dark-900 text-slate-400">
                <tr>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Product</th>
                  <th className="p-3">Price</th>
                  <th className="p-3">Gateway</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Delivery</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-dark-900/50">
                    <td className="p-3">
                      <div className="font-semibold">{o.customerName}</div>
                      <div className="text-[10px] text-slate-500">{o.customerEmail}</div>
                      <div className="text-[10px] text-slate-600">{relativeTime(o.createdAt)}</div>
                    </td>
                    <td className="p-3">
                      <div>{o.productTitle}</div>
                      {o.bookingStartsAt && (
                        <div className="text-[10px] text-sky-400">
                          {formatDateTime(o.bookingStartsAt)}
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-extrabold text-emerald-400">{o.price}</td>
                    <td className="p-3">
                      <span className="rounded bg-purple-600/20 px-2 py-0.5 font-bold text-purple-400">
                        {o.gateway}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded px-2 py-0.5 font-bold ${
                          o.status === "PAID"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : o.status === "PENDING"
                              ? "bg-amber-500/20 text-amber-400"
                              : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="p-3 text-[10px]">
                      {o.deliveredAt ? (
                        <span
                          className={
                            o.deliveryStatus === "sent" ? "text-emerald-400" : "text-amber-400"
                          }
                        >
                          {o.deliveryStatus === "sent" ? "Emailed" : "Email pending"}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {o.downloadUrl && (
                          <a
                            href={o.downloadUrl}
                            className="text-slate-400 hover:text-brand-400"
                            title={`Buyer download link · ${o.downloadsLeft ?? 0} left · expires ${formatDateTime(o.downloadExpiresAt)}`}
                          >
                            <i className="fa-solid fa-link" />
                          </a>
                        )}
                        {o.status === "PAID" && (
                          <button
                            onClick={() => resend(o)}
                            disabled={busy === o.id}
                            className="text-slate-400 hover:text-white disabled:opacity-50"
                            title="Re-send delivery email"
                          >
                            <i className="fa-solid fa-paper-plane" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {truncated && (
              <p className="pt-3 text-center text-[10px] text-slate-500">
                Showing the {orders.length} most recent of {total} matching orders.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
