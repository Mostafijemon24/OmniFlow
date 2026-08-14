import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Suspense } from "react";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!user.onboardingCompleted) redirect("/onboarding");

  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-6 p-4 md:p-6 lg:grid-cols-12">
      <DashboardSidebar />
      <section className="space-y-6 lg:col-span-9">
        <Suspense fallback={null}>{children}</Suspense>
      </section>
    </main>
  );
}
