import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getSettings } from "@/lib/settings";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up" };

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const s = await getSettings();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <h1 className="text-3xl font-semibold tracking-tight">Let&apos;s set you up</h1>
      <p className="mt-1 mb-8 text-muted">Four numbers. Everything else is derived.</p>
      <OnboardingForm defaults={{ weightKg: s.weightKg, heightCm: s.heightCm, age: s.age, sex: s.sex }} />
    </main>
  );
}
