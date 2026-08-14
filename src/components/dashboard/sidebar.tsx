"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Profile } from "@/lib/types";
import { initialsAvatar } from "@/lib/format";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  counter?: string;
  adminOnly?: boolean;
};

const nav: NavItem[] = [
  { href: "/dashboard", label: "Bio Store Builder", icon: "fa-store" },
  { href: "/dashboard/auto-dm", label: "Comment Auto-DM", icon: "fa-robot" },
  { href: "/dashboard/orders", label: "Orders & CRM", icon: "fa-receipt", counter: "orders" },
  { href: "/dashboard/analytics", label: "Funnel Analytics", icon: "fa-chart-pie" },
  { href: "/dashboard/connections", label: "Connections", icon: "fa-plug", counter: "meta" },
  { href: "/dashboard/plans", label: "Plans", icon: "fa-rocket" },
  { href: "/dashboard/billing", label: "Billing", icon: "fa-credit-card" },
  { href: "/dashboard/admin", label: "Platform Setup", icon: "fa-shield-halved", adminOnly: true },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const isSuperAdmin = Boolean(session?.user?.isSuperAdmin);

  useEffect(() => {
    let active = true;

    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => active && !data.error && setProfile(data))
      .catch(() => undefined);

    fetch("/api/orders")
      .then((r) => r.json())
      .then((data) => active && setOrderCount(typeof data.total === "number" ? data.total : null))
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const avatar = profile?.avatar || initialsAvatar(profile?.fullName || "OmniFlow");
  const visibleNav = nav.filter((item) => !item.adminOnly || isSuperAdmin);

  return (
    <aside className="space-y-4 lg:col-span-3">
      <div className="glass-card space-y-1 rounded-2xl border border-slate-800 p-3">
        {visibleNav.map((item) => {
          const active = pathname === item.href;
          const badge =
            item.counter === "orders"
              ? orderCount
              : item.counter === "meta"
                ? (profile?.metaAccounts ?? null)
                : null;

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-bold transition ${
                active
                  ? "bg-brand-600 text-white shadow-lg shadow-brand-600/20"
                  : "text-slate-400 hover:bg-dark-800 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-3">
                <i className={`fa-solid ${item.icon} w-4 text-sm`} />
                <span>{item.label}</span>
              </span>
              {badge !== null && badge !== undefined && (
                <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[9px] font-bold text-slate-200">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {profile && (
        <div className="glass-card space-y-3 rounded-2xl border border-slate-800 p-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatar}
              alt={profile.fullName}
              className="h-10 w-10 rounded-full border border-brand-500 object-cover"
            />
            <div className="min-w-0 flex-1">
              <h4 className="truncate text-xs font-bold text-white">{profile.fullName}</h4>
              <p className="truncate text-[10px] font-semibold text-brand-400">
                /{profile.username}
              </p>
            </div>
          </div>

          {profile.planStatus === "trialing" && (
            <p className="rounded-lg bg-amber-500/10 px-2 py-1.5 text-[10px] font-semibold text-amber-400">
              {profile.trialDaysLeft
                ? `${profile.trialDaysLeft} days left in trial`
                : "Trial ended — choose a plan"}
            </p>
          )}

          {profile.planNotice && profile.planNotice.level !== "active" && (
            <Link
              href="/dashboard/plans"
              className={`block rounded-lg px-2 py-1.5 text-[10px] font-semibold ${
                profile.planNotice.level === "expired"
                  ? "bg-red-500/10 text-red-400"
                  : "bg-amber-500/10 text-amber-400"
              }`}
            >
              {profile.planNotice.message}
            </Link>
          )}

          <Link
            href={`/${profile.username}?preview=1`}
            prefetch
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-dark-900 py-2 text-xs font-bold text-slate-300 transition hover:bg-dark-800"
          >
            <i className="fa-solid fa-arrow-up-right-from-square text-brand-400" />
            <span>Preview Live Page</span>
          </Link>
        </div>
      )}
    </aside>
  );
}
