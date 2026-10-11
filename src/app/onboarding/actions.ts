"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { getSettings } from "@/lib/settings";

const schema = z.object({
  weightKg: z.coerce.number().min(30, "30–300 kg").max(300, "30–300 kg"),
  heightCm: z.coerce.number().min(120, "120–250 cm").max(250, "120–250 cm"),
  age: z.coerce.number().int("Whole number").min(13, "13–100").max(100, "13–100"),
  sex: z.enum(["male", "female"], { message: "Pick one" }),
});

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
