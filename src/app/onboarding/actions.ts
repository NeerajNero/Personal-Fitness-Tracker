"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { settings } from "@/db/schema";
import { bodyStatsSchema } from "@/lib/body-stats";
import { forUser } from "@/lib/db/scope";
import { GYM_WORKOUT_TYPES } from "@/lib/library";
import { requireUser } from "@/lib/session";
import { findSettings } from "@/lib/settings";
import { computeTargets, EQUIPMENT, GOAL_KEYS } from "@/lib/targets";
import { createWorkoutType } from "@/lib/training";
import { getUser, markOnboarded } from "@/lib/users";

export const onboardingSchema = bodyStatsSchema.extend({
  goal: z.enum(GOAL_KEYS, { message: "Pick a goal" }),
  trainingLocation: z.enum(["gym", "home"], { message: "Pick one" }),
  equipment: z.array(z.enum(EQUIPMENT)).default([]),
  daysPerWeek: z.coerce.number().int("Whole number").min(1, "1–7").max(7, "1–7"),
  sessionMinutes: z.coerce.number().int("Whole number").min(15, "15–180").max(180, "15–180"),
});

type Field = keyof z.infer<typeof onboardingSchema>;
export type OnboardingState = { error: string; fieldErrors: Partial<Record<Field, string>> } | null;

/**
 * One form → targets (src/lib/targets.ts) → the user's settings row → users.onboarded_at.
 * Gym users also get the Push/Pull/Legs starter types; home users start with an empty type list.
 */
export async function completeOnboarding(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const userId = await requireUser();
  if ((await getUser(userId))?.onboardedAt) redirect("/today");

  const raw = { ...Object.fromEntries(formData), equipment: formData.getAll("equipment") };
  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    const fe = z.flattenError(parsed.error).fieldErrors;
    const fieldErrors: Partial<Record<Field, string>> = {};
    for (const k of Object.keys(fe) as Field[]) fieldErrors[k] = fe[k]?.[0];
    return { error: "Check the highlighted fields.", fieldErrors };
  }
  const v = parsed.data;
  const equipment = v.trainingLocation === "home" ? v.equipment : [];
  const t = computeTargets(v);
  const current = await findSettings(userId);
  const u = forUser(userId);
  const values = {
    weightKg: v.weightKg,
    heightCm: v.heightCm,
    age: v.age,
    sex: v.sex,
    goal: v.goal,
    trainingLocation: v.trainingLocation,
    equipment,
    daysPerWeek: v.daysPerWeek,
    sessionMinutes: v.sessionMinutes,
    weeklySessionTarget: v.daysPerWeek,
    kcalTarget: t.kcalTarget,
    kcalMin: t.kcalMin,
    kcalMax: t.kcalMax,
    proteinMin: t.proteinMin,
    proteinMax: t.proteinMax,
    telegramLinkCode: current?.telegramLinkCode ?? randomBytes(4).toString("hex").toUpperCase(),
    onboardedAt: current?.onboardedAt ?? new Date(),
    updatedAt: new Date(),
  };
  await u.db.insert(settings).values(u.stamp(values)).onConflictDoUpdate({ target: settings.userId, set: values });

  if (v.trainingLocation === "gym") {
    for (const [i, type] of GYM_WORKOUT_TYPES.entries()) await createWorkoutType(userId, type.name, i + 1, type.exercises);
  }
  await markOnboarded(userId);

  redirect("/onboarding/confirm");
}
