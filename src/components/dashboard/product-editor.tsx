"use client";

import { FormEvent, useState } from "react";
import { Product } from "@/lib/types";
import { formatBytes } from "@/lib/format";

type Draft = {
  title: string;
  type: "digital_file" | "consultation";
  price: string;
  currency: string;
  badge: string;
  description: string;
  thumbnail: string;
  fileKey?: string;
  fileName?: string;
  fileSize?: number;
  fileMime?: string;
  meetingLink: string;
  durationMinutes: string;
};

function toDraft(product?: Product | null): Draft {
  return {
    title: product?.title ?? "",
    type: product?.type ?? "digital_file",
    price: product ? String(product.price) : "",
    currency: product?.currency ?? "$",
    badge: product?.badge ?? "",
    description: product?.description ?? "",
    thumbnail: product?.thumbnail ?? "",
    fileKey: product?.fileKey ?? undefined,
    fileName: product?.fileName ?? undefined,
    fileSize: product?.fileSize ?? undefined,
    fileMime: product?.fileMime ?? undefined,
    meetingLink: product?.meetingLink ?? "",
    durationMinutes: product?.durationMinutes ? String(product.durationMinutes) : "45",
  };
}

export function ProductEditor({
  product,
  onClose,
  onSaved,
}: {
  product?: Product | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(toDraft(product));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"asset" | "product" | null>(null);

  async function upload(file: File, scope: "asset" | "product") {
    setUploading(scope);
    setError("");
    const body = new FormData();
    body.append("file", file);
    body.append("scope", scope);

    const res = await fetch("/api/upload", { method: "POST", body });
    const data = await res.json();
    setUploading(null);

    if (!res.ok) {
      setError(data.error || "Upload failed.");
      return;
    }

    if (scope === "asset") {
      setDraft((d) => ({ ...d, thumbnail: data.url }));
    } else {
      setDraft((d) => ({
        ...d,
        fileKey: data.key,
        fileName: data.name,
        fileSize: data.size,
        fileMime: data.mime,
      }));
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const payload = {
      title: draft.title,
      type: draft.type,
      price: Number(draft.price || 0),
      currency: draft.currency,
      badge: draft.badge,
      description: draft.description,
      thumbnail: draft.thumbnail,
      ...(draft.type === "digital_file"
        ? {
            fileKey: draft.fileKey,
            fileName: draft.fileName,
            fileSize: draft.fileSize,
            fileMime: draft.fileMime,
          }
        : {
            meetingLink: draft.meetingLink,
            durationMinutes: Number(draft.durationMinutes || 45),
          }),
    };

    const res = await fetch(product ? `/api/products/${product.id}` : "/api/products", {
      method: product ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || "Could not save product.");
      return;
    }
    onSaved(product ? "Product updated." : "Product published to your store.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md">
      <div className="glass-card my-8 w-full max-w-lg space-y-4 rounded-3xl border border-slate-800 p-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            {product ? "Edit Product" : "New Product"}
          </h3>
          <button onClick={onClose} className="text-sm text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["digital_file", "consultation"] as const).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setDraft({ ...draft, type: t })}
                className={`rounded-xl border p-2.5 text-xs font-bold transition ${
                  draft.type === t
                    ? "border-brand-500 bg-brand-600/20 text-white"
                    : "border-slate-800 bg-dark-900 text-slate-400"
                }`}
              >
                <i className={`fa-solid ${t === "digital_file" ? "fa-file-arrow-down" : "fa-video"} mr-2`} />
                {t === "digital_file" ? "Digital File" : "Consultation"}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-400">Title *</label>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-2 text-xs text-white focus:border-brand-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-400">Description *</label>
            <textarea
              rows={3}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-2 text-xs text-white focus:border-brand-500 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-400">Currency</label>
              <select
                value={draft.currency}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-dark-900 px-2 py-2 text-xs text-white focus:outline-none"
              >
                <option value="$">$ USD</option>
                <option value="€">€ EUR</option>
                <option value="£">£ GBP</option>
                <option value="৳">৳ BDT</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-400">Price *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-2 text-xs font-bold text-emerald-400 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-400">Badge</label>
              <input
                value={draft.badge}
                placeholder="BESTSELLER"
                onChange={(e) => setDraft({ ...draft, badge: e.target.value.toUpperCase() })}
                className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-2 text-xs text-brand-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-400">Cover image</label>
            <div className="flex items-center gap-3">
              {draft.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.thumbnail} alt="" className="h-12 w-12 rounded-lg object-cover" />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "asset")}
                className="flex-1 text-[11px] text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-dark-800 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-slate-200"
              />
            </div>
            {uploading === "asset" && <p className="mt-1 text-[11px] text-brand-400">Uploading image...</p>}
          </div>

          {draft.type === "digital_file" ? (
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-400">
                Deliverable file * (buyers get a secure, expiring link)
              </label>
              <input
                type="file"
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "product")}
                className="w-full text-[11px] text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-dark-800 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-slate-200"
              />
              {uploading === "product" && <p className="mt-1 text-[11px] text-brand-400">Uploading file...</p>}
              {draft.fileName && (
                <p className="mt-1 text-[11px] text-emerald-400">
                  <i className="fa-solid fa-paperclip mr-1" />
                  {draft.fileName} ({formatBytes(draft.fileSize)})
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="mb-1 block text-[11px] font-semibold text-slate-400">Meeting link *</label>
                <input
                  type="url"
                  placeholder="https://zoom.us/j/..."
                  value={draft.meetingLink}
                  onChange={(e) => setDraft({ ...draft, meetingLink: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-2 text-xs text-white focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-400">Minutes</label>
                <input
                  type="number"
                  min="5"
                  max="480"
                  value={draft.durationMinutes}
                  onChange={(e) => setDraft({ ...draft, durationMinutes: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>
            </div>
          )}

          {error && <p className="text-xs font-semibold text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={saving || Boolean(uploading)}
            className="w-full rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white shadow-lg transition hover:bg-brand-500 disabled:opacity-60"
          >
            {saving ? "Saving..." : product ? "Save changes" : "Publish product"}
          </button>
        </form>
      </div>
    </div>
  );
}
