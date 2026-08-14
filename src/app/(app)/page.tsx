"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useUi } from "@/components/providers/ui-provider";
import { PLAN_LIST } from "@/lib/plans";

const faqs = [
  {
    q: "Is OmniFlow compliant with Instagram & Facebook policies?",
    a: "OmniFlow only calls the official Meta Graph API. Comment webhooks are signature-verified, each comment is de-duplicated so a Meta retry can never send a second DM, replies are sent with private_replies, and anything outside Meta's 24-hour messaging window is refused and logged instead of sent.",
  },
  {
    q: "Do I need coding knowledge to set this up?",
    a: "No coding required whatsoever. You can link your Facebook or Instagram page in one click, set trigger keywords (like #KIT), and launch your digital store in under 3 minutes.",
  },
  {
    q: "How are digital files delivered to buyers?",
    a: "Deliverables are stored outside the public web root. Once payment is verified with the gateway, OmniFlow mints a single-purpose download link that expires and stops working after a set number of downloads, then emails it to the buyer. The link is always available from your Orders CRM as well.",
  },
  {
    q: "Does OmniFlow charge transaction fees on sales?",
    a: "No, on every plan. Buyers pay into your own Stripe or bKash account, so the money never passes through OmniFlow — you only pay your gateway's standard processing fee.",
  },
];

const features = [
  {
    icon: "fa-robot",
    color: "brand",
    title: "Social Comment Auto-DM",
    body: "Map trigger keywords like #KIT, PRICE, or GUIDE to your Instagram and Facebook pages. When a follower comments, OmniFlow answers the comment webhook with a private reply containing their checkout link.",
  },
  {
    icon: "fa-store",
    color: "purple",
    title: "Custom Bio Store",
    body: "Host your eBooks, courses, coaching calls, and digital downloads on your own handle. Mobile-first storefront, rendered server-side on every request so your catalogue is never stale.",
  },
  {
    icon: "fa-file-arrow-down",
    color: "emerald",
    title: "Instant File Delivery",
    body: "Automatically deliver PDFs, zip files, licenses, or video course links immediately upon successful customer payment. Zero manual email attachment work required.",
  },
  {
    icon: "fa-calendar-check",
    color: "pink",
    title: "Zoom Call Scheduler",
    body: "Sell 1-on-1 consultation and strategy sessions. Set your available calendar slots and collect upfront payments before confirming Zoom bookings.",
  },
  {
    icon: "fa-chart-pie",
    color: "sky",
    title: "Funnel Analytics & CRM",
    body: "Track the complete lifecycle from social post comments detected, DMs delivered, store visits, to paid transactions. Complete buyer lead management.",
  },
  {
    icon: "fa-shield-halved",
    color: "amber",
    title: "Meta API Compliant",
    body: "Built directly on official Meta Graph API Webhooks. Fully compliant with 24-hour messaging window rules to protect your Instagram and Facebook page reputation.",
  },
];

const featureColors: Record<string, string> = {
  brand: "bg-brand-500/10 border-brand-500/30 text-brand-400",
  purple: "bg-purple-500/10 border-purple-500/30 text-purple-400",
  emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  pink: "bg-pink-500/10 border-pink-500/30 text-pink-400",
  sky: "bg-sky-500/10 border-sky-500/30 text-sky-400",
  amber: "bg-amber-500/10 border-amber-500/30 text-amber-400",
};

type PlatformStats = {
  creators: number;
  products: number;
  ordersClosed: number;
  revenueCents: number;
  autoDmsSent: number;
  avgDmLatencyMs: number | null;
  commentToOrderRate: number | null;
};

export default function LandingPage() {
  const { openAuth, triggerToast } = useUi();
  const { data: session } = useSession();
  const [monthlyComments, setMonthlyComments] = useState(1000);
  const [avgProductPrice, setAvgProductPrice] = useState(39);
  const [assumedConversion, setAssumedConversion] = useState(10);
  const [openFaq, setOpenFaq] = useState(0);
  const [stats, setStats] = useState<PlatformStats | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/stats")
      .then((r) => r.json())
      .then((data) => {
        if (!active || data.error) return;
        setStats(data);
        if (data.commentToOrderRate > 0) setAssumedConversion(data.commentToOrderRate);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const liveMetrics = [
    {
      value: stats ? stats.creators.toLocaleString() : "—",
      label: "Creators on OmniFlow",
      color: "text-white",
    },
    {
      value: stats?.avgDmLatencyMs ? `${(stats.avgDmLatencyMs / 1000).toFixed(2)}s` : "—",
      label: "Average Auto-DM dispatch",
      color: "text-brand-400",
    },
    {
      value: stats ? stats.autoDmsSent.toLocaleString() : "—",
      label: "Auto-DMs delivered",
      color: "text-emerald-400",
    },
    {
      value: stats ? stats.ordersClosed.toLocaleString() : "—",
      label: "Orders fulfilled",
      color: "text-purple-400",
    },
  ];

  function handleOpenDashboard() {
    if (!session) {
      openAuth("login");
      triggerToast("Please register or log in to access your creator dashboard.");
    }
  }

  return (
    <div className="flex-1 space-y-28 pb-28">
      <section className="relative mx-auto max-w-5xl space-y-6 px-4 pt-16 text-center md:pt-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-2 text-xs font-semibold text-brand-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Social commerce and Auto-DM, built on the official Meta Graph API
        </div>

        <h1 className="text-4xl font-black leading-tight tracking-tight text-white md:text-6xl">
          Turn Social Comments Into{" "}
          <span className="bg-gradient-to-r from-brand-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Automated Sales & Digital Invoices
          </span>
        </h1>

        <p className="mx-auto max-w-3xl text-base leading-relaxed text-slate-300 md:text-lg">
          OmniFlow solves the biggest friction in creator monetization. Stop telling followers to
          &quot;check the link in bio.&quot; Automatically dispatch personalized store purchase links
          directly to their Instagram and Facebook DMs the instant they comment on your posts.
        </p>

        <div className="flex flex-col items-center justify-center gap-4 pt-2 sm:flex-row">
          <button
            onClick={() => openAuth("register")}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-8 py-4 text-sm font-bold text-white shadow-xl shadow-brand-600/30 transition hover:-translate-y-0.5 hover:bg-brand-500 sm:w-auto"
          >
            <span>Start Your 14-Day Free Trial</span>
            <i className="fa-solid fa-arrow-right" />
          </button>
          {session ? (
            <Link
              href="/dashboard"
              prefetch
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-dark-900 px-8 py-4 text-sm font-bold text-slate-300 transition hover:bg-dark-800 sm:w-auto"
            >
              <i className="fa-solid fa-circle-play text-brand-400" />
              <span>Explore Live Creator Studio</span>
            </Link>
          ) : (
            <button
              onClick={handleOpenDashboard}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-dark-900 px-8 py-4 text-sm font-bold text-slate-300 transition hover:bg-dark-800 sm:w-auto"
            >
              <i className="fa-solid fa-circle-play text-brand-400" />
              <span>Explore Live Creator Studio</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 pt-12 text-left md:grid-cols-4">
          {liveMetrics.map((metric) => (
            <div key={metric.label} className="glass-card rounded-2xl border border-slate-800 p-5">
              <span className={`block text-3xl font-black ${metric.color}`}>{metric.value}</span>
              <span className="mt-1 block text-xs font-medium text-slate-400">{metric.label}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          Live platform numbers, updated directly from the OmniFlow database.
        </p>
      </section>

      <section id="why-omniflow" className="mx-auto max-w-6xl space-y-12 px-4">
        <div className="space-y-3 text-center">
          <span className="block text-xs font-bold uppercase tracking-widest text-brand-400">
            The Creator Economy Bottleneck
          </span>
          <h2 className="text-3xl font-extrabold text-white md:text-4xl">Why We Built OmniFlow</h2>
          <p className="mx-auto max-w-2xl text-sm text-slate-400">
            Every step a follower has to take between wanting your product and paying for it is a
            step they can abandon. OmniFlow removes the ones you control.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="glass-card space-y-5 rounded-3xl border border-red-500/20 bg-red-950/10 p-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 font-bold text-red-400">
              ✕
            </div>
            <h3 className="text-xl font-bold text-white">The Old Way (The Bio-Link Friction)</h3>
            <ul className="space-y-3 text-xs text-slate-300">
              {[
                "Follower sees your Reel or post and wants your eBook or course.",
                "They have to leave the feed, open your profile, and click a link.",
                "They land on a cluttered link tree and hunt for the right button.",
                "Every extra tap is another chance to close the tab instead of buying.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <i className="fa-solid fa-circle-xmark mt-0.5 text-red-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-card space-y-5 rounded-3xl border border-emerald-500/30 bg-emerald-950/10 p-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 font-bold text-emerald-400">
              ✓
            </div>
            <h3 className="text-xl font-bold text-white">The OmniFlow Automated Way</h3>
            <ul className="space-y-3 text-xs text-slate-300">
              {[
                'You add a trigger word in your caption (e.g., "Comment #KIT").',
                'The follower comments "#KIT" without leaving their social feed.',
                "OmniFlow answers the comment webhook with a private reply containing the checkout link.",
                "They pay in the DM thread, and the file or booking is delivered automatically.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <i className="fa-solid fa-circle-check mt-0.5 text-emerald-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl space-y-12 px-4">
        <div className="space-y-3 text-center">
          <span className="block text-xs font-bold uppercase tracking-widest text-brand-400">
            Complete Capability Suite
          </span>
          <h2 className="text-3xl font-extrabold text-white md:text-4xl">
            Everything You Need to Scale Creator Revenue
          </h2>
          <p className="mx-auto max-w-2xl text-sm text-slate-400">
            OmniFlow combines social media comment triggers, instant digital file fulfillment, Zoom
            strategy bookings, and custom store pages into one unified ecosystem.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="glass-card space-y-4 rounded-3xl border border-slate-800 p-6 transition hover:border-brand-500/50"
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-xl font-bold ${featureColors[feature.color]}`}
              >
                <i className={`fa-solid ${feature.icon}`} />
              </div>
              <h3 className="text-lg font-bold text-white">{feature.title}</h3>
              <p className="text-xs leading-relaxed text-slate-400">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="calculator" className="mx-auto max-w-4xl px-4">
        <div className="glass-card relative space-y-8 overflow-hidden rounded-3xl border border-brand-500/30 p-8 md:p-10">
          <div className="space-y-2 text-center">
            <span className="block text-xs font-bold uppercase tracking-widest text-brand-400">
              Interactive ROI Estimator
            </span>
            <h2 className="text-2xl font-extrabold text-white md:text-3xl">
              Calculate Your Monthly Auto-DM Income
            </h2>
            <p className="text-xs text-slate-400">
              See how much revenue you could generate by automating comment sales.
            </p>
          </div>

          <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2">
            <div className="space-y-6">
              <div>
                <div className="mb-2 flex justify-between text-xs font-bold text-slate-300">
                  <span>Monthly Post Comments:</span>
                  <span className="text-brand-400">{monthlyComments.toLocaleString()} comments</span>
                </div>
                <input
                  type="range"
                  min="200"
                  max="10000"
                  step="100"
                  value={monthlyComments}
                  onChange={(e) => setMonthlyComments(Number(e.target.value))}
                  className="w-full cursor-pointer accent-brand-500"
                />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-xs font-bold text-slate-300">
                  <span>Average Product Price:</span>
                  <span className="text-emerald-400">${avgProductPrice} USD</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="250"
                  step="5"
                  value={avgProductPrice}
                  onChange={(e) => setAvgProductPrice(Number(e.target.value))}
                  className="w-full cursor-pointer accent-emerald-500"
                />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-xs font-bold text-slate-300">
                  <span>Comment-to-purchase rate you expect:</span>
                  <span className="text-sky-400">{assumedConversion}%</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="50"
                  step="1"
                  value={assumedConversion}
                  onChange={(e) => setAssumedConversion(Number(e.target.value))}
                  className="w-full cursor-pointer accent-sky-500"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-800 bg-dark-900/90 p-6 text-center">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Estimated Passive Revenue
              </span>
              <div className="text-4xl font-black text-emerald-400">
                $
                {Math.round(
                  monthlyComments * (assumedConversion / 100) * avgProductPrice
                ).toLocaleString()}{" "}
                <span className="text-xs font-normal text-slate-400">/ month</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                This is arithmetic on the three values above, not a forecast.{" "}
                {stats?.commentToOrderRate
                  ? `The slider starts at the ${stats.commentToOrderRate}% comment-to-order rate currently measured across OmniFlow stores.`
                  : "No OmniFlow store has recorded a comment-to-order rate yet, so pick your own assumption."}
              </p>
              <button
                onClick={() => openAuth("register")}
                className="w-full rounded-xl bg-brand-600 py-3 text-xs font-bold text-white shadow-lg transition hover:bg-brand-500"
              >
                Claim Your Estimated Income
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-5xl space-y-10 px-4">
        <div className="space-y-2 text-center">
          <span className="block text-xs font-bold uppercase tracking-widest text-brand-400">
            Transparent SaaS Pricing
          </span>
          <h2 className="text-2xl font-extrabold text-white md:text-3xl">Choose Your Creator Plan</h2>
          <p className="text-xs text-slate-400">
            OmniFlow takes no cut of your sales — you pay your own gateway&apos;s processing fees.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {PLAN_LIST.map((plan) => {
            const highlighted = plan.id === "pro";

            return (
              <div
                key={plan.id}
                className={`glass-card relative flex flex-col justify-between space-y-6 rounded-3xl p-6 ${
                  highlighted
                    ? "border-2 border-brand-500 shadow-2xl shadow-brand-500/10"
                    : "border border-slate-800"
                }`}
              >
                <div className="space-y-4">
                  <span
                    className={`block text-xs font-bold uppercase tracking-wider ${
                      highlighted ? "text-brand-400" : "text-slate-400"
                    }`}
                  >
                    {plan.name}
                  </span>
                  <div className="text-3xl font-black text-white">
                    ${plan.priceUsd}{" "}
                    <span className="text-xs font-normal text-slate-400">/month</span>
                  </div>
                  <p className="text-xs text-slate-400">{plan.tagline}</p>
                  <ul className="space-y-2 text-xs text-slate-300">
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <i className="fa-solid fa-check mr-2 text-emerald-400" /> {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  onClick={() => openAuth("register")}
                  className={`w-full rounded-xl py-3 text-xs font-bold text-white transition ${
                    highlighted
                      ? "bg-brand-600 shadow-lg hover:bg-brand-500"
                      : "border border-slate-800 bg-dark-900 hover:bg-dark-800"
                  }`}
                >
                  Start with {plan.name}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-4xl space-y-8 px-4">
        <div className="space-y-2 text-center">
          <span className="block text-xs font-bold uppercase tracking-widest text-brand-400">Got Questions?</span>
          <h2 className="text-2xl font-extrabold text-white md:text-3xl">Frequently Asked Questions</h2>
          <p className="text-xs text-slate-400">Everything you need to know about setup and compliance.</p>
        </div>
        <div className="space-y-3">
          {faqs.map((faq, idx) => (
            <div key={faq.q} className="glass-card space-y-2 rounded-2xl border border-slate-800 p-5">
              <button
                onClick={() => setOpenFaq(openFaq === idx ? -1 : idx)}
                className="flex w-full items-center justify-between text-left text-sm font-bold text-white focus:outline-none"
              >
                <span>{faq.q}</span>
                <i
                  className={`fa-solid text-xs ${
                    openFaq === idx ? "fa-chevron-up text-brand-400" : "fa-chevron-down text-slate-500"
                  }`}
                />
              </button>
              {openFaq === idx && (
                <p className="border-t border-slate-800 pt-2 text-xs leading-relaxed text-slate-300">
                  {faq.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <footer className="space-y-3 border-t border-slate-900 pt-12 text-center text-xs text-slate-500">
        <p>
          OmniFlow — Creator OS. Auto-DM is delivered through the official Meta Graph API and its
          24-hour messaging window.
        </p>
      </footer>
    </div>
  );
}
