"use client";

import { UiProvider } from "@/components/providers/ui-provider";
import { Toast } from "@/components/layout/toast";

/** Public bio stores have no marketing chrome and no session polling. */
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <UiProvider>
      <div className="flex min-h-screen flex-col">{children}</div>
      <Toast />
    </UiProvider>
  );
}
