"use client";

import { useEffect, useState } from "react";
import { Analytics } from "@/lib/types";
import { formatRevenue, relativeTime } from "@/lib/format";

const RANGES = [7, 30, 90];

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setError("");

    fetch(`/api/analytics?days=${days}`)
      .then(async (res) => {
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setError(data.error || "Could not load analytics.");
          return;
        }
        setStats(data);
      })
      .catch(() => active && setError("Could not reach the analytics service."));

    return () => {
      active = false;
    };
  }, [days]);

  if (error) return <p className="text-xs text-red-400">{error}</p>;
  if (!stats) return <p className="text-xs text-slate-400">Loading analytics...</p>;

  const funnel = [
    { label: "1. Comments Detected", value: stats.commentsDetected, color: "text-white" },
    { label: "2. Auto-DMs Sent", value: stats.autoDmsSent, color: "text-brand-400" },
    { label: "3. Bio Store Visits", value: stats.bioVisits, color: "text-sky-400" },
    { label: "4. Orders Closed", value: stats.ordersClosed, color: "text-emerald-400" },
  ];
  const peak = Math.max(...funnel.map((f) => f.value), 1);

  return (
    <div className="space-y-6">
      <div className="glass-card space-y-6 rounded-2xl border border-slate-800 p-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            Comment-to-Bio Sales Funnel
          </h3>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setDays(r)}
                className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition ${
                  days === r ? "bg-brand-600 text-white" : "bg-dark-900 text-slate-400"
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {funnel.map((card) => (
            <div key={card.label} className="rounded-2xl border border-slate-800 bg-dark-900 p-4">
              <span className="mb-1 block text-[10px] font-bold text-slate-500">{card.label}</span>
              <span className={`text-2xl font-black ${card.color}`}>
                {card.value.toLocaleString()}
              </span>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-dark-800">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${Math.round((card.value / peak) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Revenue" value={formatRevenue(stats.revenue)} tone="text-emerald-400" />
          <Stat
            label="Avg DM latency"
            value={stats.avgDmLatencyMs ? `${(stats.avgDmLatencyMs / 1000).toFixed(2)}s` : "—"}
            tone="text-brand-400"
          />
          <Stat
            label="Comment → order"
            value={stats.commentToOrderRate !== null ? `${stats.commentToOrderRate}%` : "—"}
            tone="text-sky-400"
          />
          <Stat
            label="Visit → order"
            value={stats.visitToOrderRate !== null ? `${stats.visitToOrderRate}%` : "—"}
            tone="text-purple-400"
          />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-dark-900 p-4">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
            <span>Monthly Auto-DM quota · {stats.dmQuota.planName}</span>
            <span>
              {stats.dmQuota.used.toLocaleString()} /{" "}
              {stats.dmQuota.limit ? stats.dmQuota.limit.toLocaleString() : "Unlimited"}
            </span>
          </div>
          {stats.dmQuota.limit && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-dark-800">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{
                  width: `${Math.min(100, Math.round((stats.dmQuota.used / stats.dmQuota.limit) * 100))}%`,
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="glass-card space-y-3 rounded-2xl border border-slate-800 p-5">
        <h3 className="border-b border-slate-800 pb-2.5 text-xs font-bold uppercase tracking-wider text-white">
          Recent Auto-DM dispatches
        </h3>
        {stats.recentDms.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">
            No DMs dispatched yet. They appear here as soon as a real comment triggers a rule.
          </p>
        ) : (
          <ul className="space-y-2">
            {stats.recentDms.map((dm) => (
              <li
                key={dm.id}
                className="flex items-center justify-between rounded-xl bg-dark-900 px-3 py-2 text-xs"
              >
                <span className="flex items-center gap-2">
                  <span className="font-bold text-brand-400">{dm.keyword}</span>
                  <span className="text-[10px] uppercase text-slate-500">{dm.platform}</span>
                </span>
                <span className="flex items-center gap-3">
                  {dm.latencyMs !== null && (
                    <span className="text-[10px] text-slate-500">{dm.latencyMs}ms</span>
                  )}
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      dm.status === "sent"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                    title={dm.error || undefined}
                  >
                    {dm.status}
                  </span>
                  <span className="text-[10px] text-slate-500">{relativeTime(dm.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-dark-900 p-4">
      <span className="mb-1 block text-[10px] font-bold text-slate-500">{label}</span>
      <span className={`text-xl font-black ${tone}`}>{value}</span>
    </div>
  );
}
