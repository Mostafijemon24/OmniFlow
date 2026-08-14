import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.onboardingCompleted) redirect("/dashboard");
  return children;
}
