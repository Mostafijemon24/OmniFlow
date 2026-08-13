"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Product, Profile } from "@/lib/types";
import { useUi } from "@/components/providers/ui-provider";
import { ProductEditor } from "@/components/dashboard/product-editor";
import { SlotManager } from "@/components/dashboard/slot-manager";
import { formatBytes, initialsAvatar } from "@/lib/format";

export default function StoreBuilderPage() {
  const { triggerToast } = useUi();
  const { update } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Persisted values, so blurring a field the creator did not touch does not
  // fire a needless save, and so a failed save can be reverted precisely.
  const saved = useRef<Partial<Profile>>({});
  const pending = useRef(0);

  const load = useCallback(async () => {
    try {
      const [p, prods] = await Promise.all([
        fetch("/api/profile").then((r) => r.json()),
        fetch("/api/products").then((r) => r.json()),
      ]);
      if (p.error) throw new Error(p.error);
      setProfile(p);
      saved.current = p;
      setProducts(Array.isArray(prods) ? prods : []);
      setLoadError("");
    } catch {
      setLoadError("Your studio could not be loaded. Check your connection and retry.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (status !== "Saved") return;
    const t = setTimeout(() => setStatus(""), 1500);
    return () => clearTimeout(t);
  }, [status]);

  async function saveProfile(patch: Partial<Profile>) {
    const changed = Object.entries(patch).some(
      ([field, value]) => saved.current[field as keyof Profile] !== value
    );
    if (!changed) return;

    const ticket = ++pending.current;
    setStatus("Saving...");

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();

    // A slower earlier save must not overwrite the outcome of a later one.
    if (ticket !== pending.current) return;

    if (!res.ok) {
      setStatus("");
      triggerToast(data.error || "Could not save profile.");
      await load();
      return;
    }

    saved.current = { ...saved.current, ...patch };
    setStatus("Saved");
    if (patch.username) await update({ username: data.username });
  }

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    const body = new FormData();
    body.append("file", file);
    body.append("scope", "asset");
    const res = await fetch("/api/upload", { method: "POST", body });
    const data = await res.json();
    setUploadingAvatar(false);
    if (!res.ok) {
      triggerToast(data.error || "Avatar upload failed.");
      return;
    }
    setProfile((p) => (p ? { ...p, avatar: data.url } : p));
    await saveProfile({ avatar: data.url });
  }

  async function deleteProduct(product: Product) {
    const res = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      triggerToast(data.error || "Could not delete product.");
      return;
    }
    triggerToast(data.message || "Product deleted.");
    load();
  }

  async function toggleActive(product: Product) {
    const res = await fetch(`/api/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !product.active }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      triggerToast(data.error || "Could not change visibility.");
    }
    load();
  }

  if (!profile) {
    return loadError ? (
      <div className="space-y-3 text-xs text-slate-400">
        <p className="text-rose-300">{loadError}</p>
        <button
          onClick={load}
          className="rounded-lg border border-slate-700 bg-dark-900 px-3 py-2 font-bold text-white transition hover:bg-dark-800"
        >
          Retry
        </button>
      </div>
    ) : (
      <p className="text-xs text-slate-400">Loading your studio...</p>
    );
  }

  const avatar = profile.avatar || initialsAvatar(profile.fullName);
  const limitReached =
    profile.maxProducts !== null &&
    profile.maxProducts !== undefined &&
    products.length >= profile.maxProducts;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-5 xl:col-span-7">
        <div className="glass-card space-y-4 rounded-2xl border border-slate-800 p-5">
          <h3 className="flex items-center justify-between border-b border-slate-800 pb-2.5 text-xs font-bold uppercase tracking-wider text-white">
            <span>Profile Branding</span>
            <span className="text-[10px] font-semibold text-emerald-400">{status}</span>
          </h3>

          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatar} alt="" className="h-14 w-14 rounded-full border border-brand-500 object-cover" />
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-semibold text-slate-400">
                Profile photo
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
                className="w-full text-[11px] text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-dark-800 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-slate-200"
              />
              {uploadingAvatar && <p className="text-[11px] text-brand-400">Uploading...</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-400">Username Handle</label>
              <input
                value={profile.username}
                onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                onBlur={(e) => saveProfile({ username: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-1.5 text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-400">Full Name</label>
              <input
                value={profile.fullName}
                onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                onBlur={(e) => saveProfile({ fullName: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-1.5 text-xs text-white focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-[11px] font-semibold text-slate-400">Headline</label>
              <input
                value={profile.headline || ""}
                onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
                onBlur={(e) => saveProfile({ headline: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-1.5 text-xs font-semibold text-brand-400 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-[11px] font-semibold text-slate-400">Bio Description</label>
              <textarea
                rows={2}
                value={profile.bio || ""}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                onBlur={(e) => saveProfile({ bio: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-1.5 text-xs text-white focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="glass-card space-y-4 rounded-2xl border border-slate-800 p-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Digital Products ({products.length}
              {profile.maxProducts ? ` / ${profile.maxProducts}` : ""})
            </h3>
            <button
              onClick={() => setEditing(null)}
              disabled={limitReached}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-500 disabled:opacity-50"
              title={limitReached ? "Plan limit reached — upgrade to add more" : undefined}
            >
              + Add Product
            </button>
          </div>

          {products.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-400">
              No products yet. Add an eBook, template, or a paid 1-on-1 consultation to start selling.
            </p>
          )}

          <div className="space-y-3">
            {products.map((prod) => (
              <div key={prod.id} className="space-y-3 rounded-xl border border-slate-800 bg-dark-900/80 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={prod.thumbnail || initialsAvatar(prod.title)}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                    <div className="min-w-0">
                      <h4 className="truncate text-xs font-bold text-white">{prod.title}</h4>
                      <span className="text-xs font-extrabold text-emerald-400">
                        {prod.currency}
                        {prod.price}
                      </span>
                      <span className="ml-2 text-[10px] text-slate-500">
                        {prod.salesCount} sold
                        {prod.type === "digital_file" && prod.fileName
                          ? ` · ${formatBytes(prod.fileSize)}`
                          : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {prod.type === "consultation" && (
                      <button
                        onClick={() => setExpanded(expanded === prod.id ? null : prod.id)}
                        className="p-1.5 text-xs text-slate-400 hover:text-brand-400"
                        title="Manage slots"
                      >
                        <i className="fa-solid fa-calendar-days" />
                      </button>
                    )}
                    <button
                      onClick={() => toggleActive(prod)}
                      className={`p-1.5 text-xs ${prod.active ? "text-emerald-400" : "text-slate-500"}`}
                      title={prod.active ? "Visible in store" : "Hidden from store"}
                    >
                      <i className={`fa-solid ${prod.active ? "fa-eye" : "fa-eye-slash"}`} />
                    </button>
                    <button
                      onClick={() => setEditing(prod)}
                      className="p-1.5 text-xs text-slate-400 hover:text-white"
                    >
                      <i className="fa-solid fa-pen" />
                    </button>
                    <button
                      onClick={() => deleteProduct(prod)}
                      className="p-1.5 text-xs text-slate-500 hover:text-red-400"
                    >
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                </div>

                {expanded === prod.id && prod.type === "consultation" && (
                  <SlotManager product={prod} onChanged={load} onError={triggerToast} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center xl:col-span-5">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Live preview of your public storefront
        </div>
        <div className="relative h-[620px] w-[320px] overflow-hidden rounded-[42px] border-[6px] border-slate-800 bg-black p-3 shadow-2xl">
          <div className="h-full w-full overflow-y-auto rounded-[34px] bg-slate-950 p-4 pt-8 text-white">
            <div className="mb-4 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatar}
                alt=""
                className="mx-auto h-16 w-16 rounded-full border-2 border-brand-500 object-cover"
              />
              <h2 className="mt-2 text-xs font-extrabold">{profile.fullName}</h2>
              <p className="text-[10px] font-bold text-brand-400">{profile.headline}</p>
              <p className="mt-1 line-clamp-3 px-2 text-[10px] leading-relaxed text-slate-400">
                {profile.bio}
              </p>
            </div>
            <div className="space-y-2.5">
              {products.filter((p) => p.active).length === 0 && (
                <p className="text-center text-[10px] text-slate-500">
                  Your public store is empty right now.
                </p>
              )}
              {products
                .filter((p) => p.active)
                .map((prod) => (
                  <div
                    key={prod.id}
                    className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900 p-2.5"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={prod.thumbnail || initialsAvatar(prod.title)}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-[11px] font-bold text-white">{prod.title}</h4>
                      <span className="text-[10px] font-extrabold text-emerald-400">
                        {prod.currency}
                        {prod.price}
                      </span>
                    </div>
                    <a
                      href={`/${profile.username}?prod=${prod.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md bg-brand-600 px-2.5 py-1 text-[10px] font-bold text-white"
                    >
                      Buy
                    </a>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {editing !== undefined && (
        <ProductEditor
          product={editing}
          onClose={() => setEditing(undefined)}
          onSaved={(msg) => {
            setEditing(undefined);
            triggerToast(msg);
            load();
          }}
        />
      )}
    </div>
  );
}
