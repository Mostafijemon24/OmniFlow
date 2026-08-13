import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardSidebar } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (user && !user.onboardingCompleted) redirect("/onboarding");

  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-6 p-4 md:p-6 lg:grid-cols-12">
      <DashboardSidebar />
      <section className="space-y-6 lg:col-span-9">{children}</section>
    </main>
  );
}
