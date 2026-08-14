import { Suspense } from "react";
import { Providers } from "@/components/providers/session-provider";
import { Header } from "@/components/layout/header";
import { SocialErrorNotice } from "@/components/auth/social-error-notice";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <Suspense>
        <SocialErrorNotice />
      </Suspense>
      <div className="flex min-h-screen flex-col">
        <Header />
        {children}
      </div>
    </Providers>
  );
}
