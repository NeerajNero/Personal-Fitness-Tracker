"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { settings } from "@/db/schema";
import { action } from "@/lib/action-result";
import { forUser } from "@/lib/db/scope";
import { GYM_WORKOUT_TYPES } from "@/lib/library";
import { onboardingSchema, type OnboardingField, type OnboardingState } from "@/lib/onboarding";
import { requireUser } from "@/lib/session";
import { findSettings } from "@/lib/settings";
import { computeTargets } from "@/lib/targets";
import { createWorkoutType } from "@/lib/training";
import { getUser, markOnboarded } from "@/lib/users";

export type { OnboardingState };

/**
 * One form → targets (src/lib/targets.ts) → the user's settings row → users.onboarded_at.
 * Gym users also get the Push/Pull/Legs starter types; home users start with an empty type list.
 * Resumable: a settings row left by an earlier attempt (users.onboarded_at still null) is updated, not inserted again.
 * Only async functions may be exported from this file; the schema lives in src/lib/onboarding.ts.
 */
export const completeOnboarding = action("completeOnboarding", async (_prev: OnboardingState, formData: FormData): Promise<OnboardingState> => {
  const userId = await requireUser();
  if ((await getUser(userId))?.onboardedAt) redirect("/today");

  const raw = { ...Object.fromEntries(formData), equipment: formData.getAll("equipment") };
  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    const fe = z.flattenError(parsed.error).fieldErrors;
    const fieldErrors: Partial<Record<OnboardingField, string>> = {};
    for (const k of Object.keys(fe) as OnboardingField[]) fieldErrors[k] = fe[k]?.[0];
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
  if (current) await u.db.update(settings).set(values).where(u.own(settings));
  else await u.db.insert(settings).values(u.stamp(values));

  if (v.trainingLocation === "gym") {
    // createWorkoutType is a no-op for a name that already exists, so a retry doesn't duplicate Push/Pull/Legs.
    for (const [i, type] of GYM_WORKOUT_TYPES.entries()) await createWorkoutType(userId, type.name, i + 1, type.exercises);
  }
  await markOnboarded(userId);

  redirect("/onboarding/confirm");
});
