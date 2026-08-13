"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useUi } from "@/components/providers/ui-provider";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const { openAuth, triggerToast } = useUi();
  const isLanding = pathname === "/";
  const isDashboard = pathname.startsWith("/dashboard");

  function handleOpenDashboard() {
    if (!session) {
      openAuth("login");
      triggerToast("Please register or log in to access your creator dashboard.");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <header className="glass-card sticky top-0 z-40 flex items-center justify-between border-b border-slate-800 px-4 py-3.5 md:px-8">
      <Link href="/" className="flex cursor-pointer items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 via-purple-600 to-pink-500 text-xl font-extrabold text-white shadow-lg shadow-brand-500/30">
          <i className="fa-solid fa-infinity" />
        </div>
        <div>
          <h1 className="flex items-center gap-2 text-base font-extrabold text-white">
            OmniFlow{" "}
            <span className="rounded-full border border-brand-500/30 bg-brand-500/20 px-2 py-0.5 text-[10px] font-bold text-brand-400">
              CREATOR OS
            </span>
          </h1>
          <p className="hidden text-[10px] text-slate-400 sm:block">
            Bio Store & Social Comment Auto-DM Operating System
          </p>
        </div>
      </Link>

      <div className="flex items-center gap-3">
        {isLanding && (
          <div className="mr-4 hidden items-center gap-6 text-xs font-semibold text-slate-300 lg:flex">
            <a href="#why-omniflow" className="transition hover:text-brand-400">Why OmniFlow</a>
            <a href="#features" className="transition hover:text-brand-400">Features</a>
            <a href="#calculator" className="transition hover:text-brand-400">Revenue Calculator</a>
            <a href="#pricing" className="transition hover:text-brand-400">Pricing</a>
            <a href="#faq" className="transition hover:text-brand-400">FAQ</a>
          </div>
        )}

        {status === "loading" ? null : session ? (
          <div className="flex items-center gap-2">
            <Link
              href={`/${session.user.username}`}
              target="_blank"
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-dark-900 px-3.5 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-dark-800"
            >
              <i className="fa-solid fa-globe text-brand-400" />
              <span className="hidden sm:inline">My Store</span>
            </Link>
            <button
              onClick={handleOpenDashboard}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                isDashboard
                  ? "bg-brand-600 text-white shadow-lg shadow-brand-600/20"
                  : "border border-slate-700 bg-dark-800 text-slate-200"
              }`}
            >
              <i className="fa-solid fa-gauge" />
              <span>Creator Dashboard</span>
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              title="Sign Out"
              className="rounded-xl border border-slate-800 bg-dark-900 p-2 text-xs text-slate-400 transition hover:text-red-400"
            >
              <i className="fa-solid fa-right-from-bracket" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => openAuth("login")}
              className="rounded-xl px-3.5 py-1.5 text-xs font-bold text-slate-300 transition hover:text-white"
            >
              Sign In
            </button>
            <button
              onClick={() => openAuth("register")}
              className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5 hover:bg-brand-500"
            >
              Get Started Free <i className="fa-solid fa-arrow-right ml-1" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
