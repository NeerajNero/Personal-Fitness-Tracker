/**
 * Targets per goal (client-safe, pure). Onboarding computes them once and writes them to settings;
 * the owner's stored numbers are never touched by this file.
 */
import type { Goal } from "@/db/schema";

export const GOALS: Record<Goal, { label: string; blurb: string; kcalDelta: number; proteinGPerKg: [number, number]; maxLossPctPerWeek: number }> = {
  recomp: { label: "Recomp", blurb: "Lose fat, keep muscle. Mild deficit.", kcalDelta: -225, proteinGPerKg: [1.8, 2.0], maxLossPctPerWeek: 0.5 },
  fat_loss: { label: "Fat loss", blurb: "Lose 0.5–1 % of bodyweight a week.", kcalDelta: -500, proteinGPerKg: [2.0, 2.2], maxLossPctPerWeek: 1.0 },
  muscle_gain: { label: "Muscle gain", blurb: "Small surplus, slow gain.", kcalDelta: 250, proteinGPerKg: [1.8, 2.0], maxLossPctPerWeek: 0.5 },
};
export const GOAL_KEYS = Object.keys(GOALS) as Goal[];

/** Fat-loss weekly rate band, % of bodyweight. */
export const FAT_LOSS_RATE_PCT: [number, number] = [0.5, 1.0];

/** Calorie floor for fat loss. */
export const KCAL_FLOOR = { female: 1400, male: 1600 } as const;

export const EQUIPMENT = ["none", "dumbbells", "bands", "pullup_bar"] as const;
export type Equipment = (typeof EQUIPMENT)[number];
export const EQUIPMENT_LABEL: Record<Equipment, string> = { none: "Bodyweight only", dumbbells: "Dumbbells", bands: "Bands", pullup_bar: "Pull-up bar" };

export type TargetInput = { weightKg: number; heightCm: number; age: number; sex: "male" | "female"; goal: Goal; daysPerWeek: number };
export type ComputedTargets = { maintenance: number; kcalTarget: number; kcalMin: number; kcalMax: number; proteinMin: number; proteinMax: number };

/** Mifflin-St Jeor resting energy. */
export function bmr(i: Pick<TargetInput, "weightKg" | "heightCm" | "age" | "sex">): number {
  return 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age + (i.sex === "male" ? 5 : -161);
}

/** Activity factor from training days per week. */
export function activityFactor(daysPerWeek: number): number {
  if (daysPerWeek <= 0) return 1.2;
  if (daysPerWeek <= 2) return 1.375;
  if (daysPerWeek <= 4) return 1.55;
  if (daysPerWeek <= 6) return 1.725;
  return 1.9;
}

const to5 = (n: number) => Math.round(n / 5) * 5;

export function computeTargets(i: TargetInput): ComputedTargets {
  const g = GOALS[i.goal];
  const maintenance = Math.round(bmr(i) * activityFactor(i.daysPerWeek));
  let kcalTarget = to5(maintenance + g.kcalDelta);
  if (i.goal === "fat_loss") kcalTarget = Math.max(kcalTarget, KCAL_FLOOR[i.sex]);
  return {
    maintenance,
    kcalTarget,
    kcalMin: kcalTarget - 25,
    kcalMax: kcalTarget + 25,
    proteinMin: Math.round(g.proteinGPerKg[0] * i.weightKg),
    proteinMax: Math.round(g.proteinGPerKg[1] * i.weightKg),
  };
}
