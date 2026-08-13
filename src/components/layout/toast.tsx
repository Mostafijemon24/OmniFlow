"use client";

import { useUi } from "@/components/providers/ui-provider";

export function Toast() {
  const { toast } = useUi();
  if (!toast) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 animate-bounce items-center gap-2 rounded-2xl border border-brand-400/30 bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-2xl">
      <i className="fa-solid fa-circle-check" />
      <span>{toast}</span>
    </div>
  );
}
