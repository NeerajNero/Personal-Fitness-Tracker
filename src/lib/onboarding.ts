/**
 * The onboarding form's input, shared by the action and its test. Lives here, not in the action file: a "use server"
 * module may export only async functions (Next checks at load time and the whole module fails otherwise).
 */
import { z } from "zod";
import { bodyStatsSchema } from "@/lib/body-stats";
import { EQUIPMENT, GOAL_KEYS } from "@/lib/targets";

export const onboardingSchema = bodyStatsSchema.extend({
  goal: z.enum(GOAL_KEYS, { message: "Pick a goal" }),
  trainingLocation: z.enum(["gym", "home"], { message: "Pick one" }),
  equipment: z.array(z.enum(EQUIPMENT)).default([]),
  daysPerWeek: z.coerce.number().int("Whole number").min(1, "1–7").max(7, "1–7"),
  sessionMinutes: z.coerce.number().int("Whole number").min(15, "15–180").max(180, "15–180"),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type OnboardingField = keyof OnboardingInput;
export type OnboardingState = { error: string; fieldErrors: Partial<Record<OnboardingField, string>> } | null;
