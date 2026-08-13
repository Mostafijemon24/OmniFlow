"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Product, Profile } from "@/lib/types";
import { useUi } from "@/components/providers/ui-provider";
import { formatDateTime, initialsAvatar } from "@/lib/format";

type Gateway = "Stripe" | "bKash";

type Fulfillment = {
  productType?: string;
  downloadUrl?: string;
  meetingLink?: string;
  startsAt?: string;
};

export function PublicStore({
  profile,
  products,
  gateways,
}: {
  profile: Profile;
  products: Product[];
  gateways: { stripe: boolean; bkash: boolean };
}) {
  const { triggerToast } = useUi();
  const searchParams = useSearchParams();
  const [checkoutProduct, setCheckoutProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    gateway: (gateways.stripe ? "Stripe" : "bKash") as Gateway,
    slotId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fulfillment, setFulfillment] = useState<Fulfillment | null>(null);

  const confirmOrder = useCallback(
    async (orderId: string, sessionId: string | null) => {
      const params = new URLSearchParams({ orderId });
      if (sessionId) params.set("session_id", sessionId);
      const res = await fetch(`/api/checkout/confirm?${params}`);
      const data = await res.json();
      if (data.status === "PAID") {
        setFulfillment(data);
        triggerToast("Payment confirmed. Your delivery is ready.");
      } else if (data.error) {
        triggerToast(data.error);
      }
    },
    [triggerToast]
  );

  useEffect(() => {
    const prodId = searchParams.get("prod");
    if (prodId) {
      const match = products.find((p) => p.id === prodId);
      if (match) setCheckoutProduct(match);
    }
    const orderId = searchParams.get("order");
    if (orderId) confirmOrder(orderId, searchParams.get("session_id"));
    if (searchParams.get("checkout") === "cancel") {
      triggerToast("Payment was cancelled.");
    }
  }, [searchParams, products, confirmOrder, triggerToast]);

  function openCheckout(product: Product) {
    setError("");
    setFulfillment(null);
    setForm((f) => ({
      ...f,
      slotId: product.slots?.find((s) => !s.booked)?.id || "",
      gateway: product.currency === "৳" && gateways.bkash ? "bKash" : f.gateway,
    }));
    setCheckoutProduct(product);
  }

  async function checkout(e: FormEvent) {
    e.preventDefault();
    if (!checkoutProduct) return;
    setError("");
    setSubmitting(true);

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: checkoutProduct.id,
        customerName: form.name,
        customerEmail: form.email,
        customerPhone: form.phone,
        gateway: form.gateway,
        slotId: checkoutProduct.type === "consultation" ? form.slotId : undefined,
      }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error || "Checkout failed.");
      return;
    }

    if (data.mode === "redirect") {
      window.location.href = data.url;
      return;
    }

    setCheckoutProduct(null);
    setFulfillment({
      productType: checkoutProduct.type,
      downloadUrl: data.downloadUrl,
      meetingLink: data.meetingLink,
    });
    triggerToast("Order complete.");
  }

  const avatar = profile.avatar || initialsAvatar(profile.fullName);
  const noGateway = !gateways.stripe && !gateways.bkash;

  return (
    <div className="mx-auto w-full max-w-xl flex-1 space-y-6 p-4 md:p-6">
      <div className="space-y-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatar}
          alt={profile.fullName}
          className="mx-auto h-24 w-24 rounded-full border-4 border-brand-500 object-cover shadow-2xl"
        />
        <div>
          <h2 className="flex items-center justify-center gap-2 text-lg font-extrabold text-white">
            {profile.fullName} <i className="fa-solid fa-circle-check text-sm text-brand-500" />
          </h2>
          {profile.headline && (
            <p className="mt-0.5 text-xs font-bold text-brand-400">{profile.headline}</p>
          )}
        </div>
        {profile.bio && (
          <p className="mx-auto max-w-md text-xs leading-relaxed text-slate-300">{profile.bio}</p>
        )}
      </div>

      {fulfillment && (
        <div className="glass-card space-y-2 rounded-2xl border border-emerald-500/40 p-4 text-center">
          <p className="text-xs font-bold text-emerald-400">Your purchase is ready</p>
          {fulfillment.downloadUrl && (
            <a
              href={fulfillment.downloadUrl}
              className="inline-block rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white"
            >
              Download now
            </a>
          )}
          {fulfillment.meetingLink && (
            <a
              href={fulfillment.meetingLink}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white"
            >
              Join your session{fulfillment.startsAt ? ` · ${formatDateTime(fulfillment.startsAt)}` : ""}
            </a>
          )}
          <p className="text-[10px] text-slate-400">A copy was emailed to you if email is enabled.</p>
        </div>
      )}

      <div className="space-y-3 pt-2">
        <h3 className="text-center text-xs font-bold uppercase tracking-wider text-slate-400">
          Digital Store Resources & Consultations
        </h3>

        {products.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-xs text-slate-400">
            This creator has not published any products yet.
          </p>
        )}

        {products.map((prod) => {
          const openSlots = prod.slots?.filter((s) => !s.booked) ?? [];
          const soldOut = prod.type === "consultation" && openSlots.length === 0;

          return (
            <div
              key={prod.id}
              className="glass-card flex items-center gap-4 rounded-2xl border border-slate-800 p-4 transition hover:border-brand-500/50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={prod.thumbnail || initialsAvatar(prod.title)}
                alt=""
                className="h-16 w-16 rounded-xl object-cover"
              />
              <div className="min-w-0 flex-1">
                {prod.badge && (
                  <span className="rounded border border-brand-500/20 bg-brand-500/10 px-2 py-0.5 text-[9px] font-extrabold uppercase text-brand-400">
                    {prod.badge}
                  </span>
                )}
                <h4 className="mt-1 text-xs font-bold text-white">{prod.title}</h4>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{prod.description}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs font-extrabold text-emerald-400">
                    {prod.price === 0 ? "Free" : `${prod.currency}${prod.price}`}
                  </span>
                  {prod.type === "consultation" && (
                    <span className="text-[10px] text-sky-400">
                      {prod.durationMinutes}min · {openSlots.length} slots
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => openCheckout(prod)}
                disabled={soldOut}
                className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-500 disabled:opacity-50"
              >
                {soldOut ? "Sold out" : prod.price === 0 ? "Get" : "Buy Now"}
              </button>
            </div>
          );
        })}
      </div>

      {checkoutProduct && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md">
          <div className="glass-card my-8 w-full max-w-md space-y-5 rounded-3xl border border-slate-800 p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Instant Checkout
              </h3>
              <button
                onClick={() => setCheckoutProduct(null)}
                className="text-sm text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-dark-900 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={checkoutProduct.thumbnail || initialsAvatar(checkoutProduct.title)}
                alt=""
                className="h-12 w-12 rounded-lg object-cover"
              />
              <div>
                <h4 className="text-xs font-bold text-white">{checkoutProduct.title}</h4>
                <span className="text-xs font-extrabold text-emerald-400">
                  {checkoutProduct.price === 0
                    ? "Free"
                    : `${checkoutProduct.currency}${checkoutProduct.price}`}
                </span>
              </div>
            </div>

            <form onSubmit={checkout} className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-400">Full Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-2 text-xs text-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-400">
                  Email (delivery address) *
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-2 text-xs text-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-400">Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-2 text-xs text-white focus:outline-none"
                  required={form.gateway === "bKash"}
                />
              </div>

              {checkoutProduct.type === "consultation" && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-400">
                    Choose your session slot *
                  </label>
                  <select
                    value={form.slotId}
                    onChange={(e) => setForm({ ...form, slotId: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-2 text-xs text-white focus:outline-none"
                    required
                  >
                    <option value="">Select a time</option>
                    {checkoutProduct.slots
                      ?.filter((s) => !s.booked)
                      .map((slot) => (
                        <option key={slot.id} value={slot.id}>
                          {formatDateTime(slot.startsAt)}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {checkoutProduct.price > 0 && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-400">
                    Payment gateway
                  </label>
                  {noGateway ? (
                    <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-300">
                      This creator has not connected a payment gateway yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {(["Stripe", "bKash"] as Gateway[])
                        .filter((gw) => (gw === "Stripe" ? gateways.stripe : gateways.bkash))
                        .map((gw) => (
                          <button
                            type="button"
                            key={gw}
                            onClick={() => setForm({ ...form, gateway: gw })}
                            className={`rounded-xl border p-2.5 text-center text-xs font-bold ${
                              form.gateway === gw
                                ? "border-brand-500 bg-brand-600/20 text-white"
                                : "border-slate-800 bg-dark-900 text-slate-400"
                            }`}
                          >
                            {gw}
                          </button>
                        ))}
                    </div>
                  )}
                  <p className="mt-1 text-[10px] text-slate-500">
                    Stripe Checkout also covers Apple Pay and Google Pay on supported devices.
                  </p>
                </div>
              )}

              {error && <p className="text-xs font-semibold text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={submitting || (checkoutProduct.price > 0 && noGateway)}
                className="mt-2 w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-lg transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {submitting
                  ? "Processing..."
                  : checkoutProduct.price === 0
                    ? "Get instant access"
                    : `Pay ${checkoutProduct.currency}${checkoutProduct.price}`}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
