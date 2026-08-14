"use client";

import { SessionProvider } from "next-auth/react";
import { UiProvider } from "@/components/providers/ui-provider";
import { AuthModal } from "@/components/auth/auth-modal";
import { Toast } from "@/components/layout/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchWhenOffline={false}>
      <UiProvider>
        {children}
        <AuthModal />
        <Toast />
      </UiProvider>
    </SessionProvider>
  );
}
