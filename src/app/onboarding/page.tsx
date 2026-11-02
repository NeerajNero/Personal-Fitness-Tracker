import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getUser } from "@/lib/users";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up" };

export default async function OnboardingPage() {
  const userId = await requireUser();
  if ((await getUser(userId))?.onboardedAt) redirect("/today");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <h1 className="text-3xl font-semibold tracking-tight">Let&apos;s set you up</h1>
      <p className="mt-1 mb-8 text-muted">A few numbers and a goal. Everything else is derived.</p>
      <OnboardingForm />
    </main>
  );
}
