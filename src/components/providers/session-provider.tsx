"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SessionProvider, useSession } from "next-auth/react";
import { UiProvider } from "@/components/providers/ui-provider";
import { AuthModal } from "@/components/auth/auth-modal";
import { Toast } from "@/components/layout/toast";
import {
  DASHBOARD_API_URLS,
  DASHBOARD_ROUTES,
  prefetchJson,
} from "@/lib/client-cache";

function DashboardWarmup() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;

    for (const href of DASHBOARD_ROUTES) {
      if (href.startsWith("/dashboard/admin") && !session?.user?.isSuperAdmin) continue;
      router.prefetch(href);
    }
    for (const url of DASHBOARD_API_URLS) prefetchJson(url);
  }, [status, session?.user?.isSuperAdmin, router]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchOnWindowFocus={false}
      refetchWhenOffline={false}
      refetchInterval={0}
    >
      <UiProvider>
        <DashboardWarmup />
        {children}
        <AuthModal />
        <Toast />
      </UiProvider>
    </SessionProvider>
  );
}
