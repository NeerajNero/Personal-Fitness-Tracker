import type { Goal, Settings } from "@/db/schema";

export type Phase = "veg" | "nonveg";

/** True when the owner-style veg/non-veg phases are set up (every phase column non-null). */
export function phasesEnabled(s: Settings): boolean {
  return s.phaseSwitchDate !== null && s.proteinMinVeg !== null && s.proteinMaxVeg !== null && s.proteinMinNonveg !== null && s.proteinMaxNonveg !== null;
}

/** Protein phase for a date: explicit override wins, else by date against phase_switch_date. No phases → everything is in reach (nonveg). */
export function getPhase(date: string, s: Settings): Phase {
  if (s.phaseOverride) return s.phaseOverride;
  if (s.phaseSwitchDate === null) return "nonveg";
  return date >= s.phaseSwitchDate ? "nonveg" : "veg";
}

export type Targets = {
  goal: Goal;
  phase: Phase;
  kcal: number;
  kcalRange: [number, number];
  proteinMin: number;
  proteinMax: number;
  /** Rest-day step floor; `stepsRange` holds the full band. */
  steps: number;
  stepsRange: [number, number];
  /** Monthly protein budget in INR for the phase; null when the user has no budgets. */
  budget: number | null;
};

export function getTargets(date: string, s: Settings): Targets {
  const phase = getPhase(date, s);
  const veg = phase === "veg";
  const phased = phasesEnabled(s);
  return {
    goal: s.goal,
    phase,
    kcal: s.kcalTarget,
    kcalRange: [s.kcalMin, s.kcalMax],
    proteinMin: (phased ? (veg ? s.proteinMinVeg : s.proteinMinNonveg) : s.proteinMin) ?? s.proteinMin ?? 0,
    proteinMax: (phased ? (veg ? s.proteinMaxVeg : s.proteinMaxNonveg) : s.proteinMax) ?? s.proteinMax ?? 0,
    steps: s.stepsMin,
    stepsRange: [s.stepsMin, s.stepsMax],
    budget: veg ? s.budgetVegInr : s.budgetNonvegInr,
  };
}

/** veg phase shows veg + both; nonveg phase shows everything. Client-safe (no db import). */
export function foodInPhase(food: { phaseTag: "veg" | "nonveg" | "both" }, phase: Phase): boolean {
  return phase === "nonveg" || food.phaseTag !== "nonveg";
}
