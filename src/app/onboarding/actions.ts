"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { bodyStatsSchema } from "@/lib/body-stats";
import { settings } from "@/db/schema";
import { getSettings } from "@/lib/settings";

const schema = bodyStatsSchema;

type Field = keyof z.infer<typeof schema>;
export type OnboardingState = { error: string; fieldErrors: Partial<Record<Field, string>> } | null;

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fe = z.flattenError(parsed.error).fieldErrors;
    return {
      error: "Check the highlighted fields.",
      fieldErrors: {
        weightKg: fe.weightKg?.[0],
        heightCm: fe.heightCm?.[0],
        age: fe.age?.[0],
        sex: fe.sex?.[0],
      },
    };
  }

  const current = await getSettings();
  await db
    .update(settings)
    .set({
      ...parsed.data,
      telegramLinkCode: current.telegramLinkCode ?? randomBytes(4).toString("hex").toUpperCase(),
      onboardedAt: current.onboardedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(settings.id, 1));

  redirect("/onboarding/confirm");
}
