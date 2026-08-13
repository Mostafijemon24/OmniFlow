"use client";

import { useState } from "react";
import { Product } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

export function SlotManager({
  product,
  onChanged,
  onError,
}: {
  product: Product;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function addSlot() {
    if (!value) return;
    setBusy(true);
    const res = await fetch(`/api/products/${product.id}/slots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startsAt: new Date(value).toISOString() }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      onError(data.error || "Could not add slot.");
      return;
    }
    setValue("");
    onChanged();
  }

  async function removeSlot(slotId: string) {
    const res = await fetch(`/api/products/${product.id}/slots?slotId=${slotId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      onError(data.error || "Could not remove slot.");
      return;
    }
    onChanged();
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-800 bg-dark-950 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
        Available session slots
      </p>

      <div className="flex gap-2">
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 rounded-lg border border-slate-800 bg-dark-900 px-2.5 py-1.5 text-[11px] text-white focus:outline-none"
        />
        <button
          onClick={addSlot}
          disabled={busy || !value}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {product.slots?.length ? (
        <ul className="space-y-1">
          {product.slots.map((slot) => (
            <li
              key={slot.id}
              className="flex items-center justify-between rounded-lg bg-dark-900 px-2.5 py-1.5 text-[11px]"
            >
              <span className={slot.booked ? "text-slate-500 line-through" : "text-slate-200"}>
                {formatDateTime(slot.startsAt)}
              </span>
              {slot.booked ? (
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
                  BOOKED
                </span>
              ) : (
                <button
                  onClick={() => removeSlot(slot.id)}
                  className="text-slate-500 hover:text-red-400"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-slate-500">
          No slots yet. Buyers cannot book this consultation until you add one.
        </p>
      )}
    </div>
  );
}
