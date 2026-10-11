import type { Settings } from "@/db/schema";

export type Phase = "veg" | "nonveg";

/** Protein phase for a date: explicit override wins, else by date against phase_switch_date. */
export function getPhase(date: string, s: Settings): Phase {
  if (s.phaseOverride) return s.phaseOverride;
  return date >= s.phaseSwitchDate ? "nonveg" : "veg";
}

export type Targets = {
  phase: Phase;
  kcal: number;
  kcalRange: [number, number];
  proteinMin: number;
  proteinMax: number;
  /** Rest-day step floor; `stepsRange` holds the full band. */
  steps: number;
  stepsRange: [number, number];
  /** Monthly protein budget in INR for the phase. */
  budget: number;
};

export function getTargets(date: string, s: Settings): Targets {
  const phase = getPhase(date, s);
  const veg = phase === "veg";
  return {
    phase,
    kcal: s.kcalTarget,
    kcalRange: [s.kcalMin, s.kcalMax],
    proteinMin: veg ? s.proteinMinVeg : s.proteinMinNonveg,
    proteinMax: veg ? s.proteinMaxVeg : s.proteinMaxNonveg,
    steps: s.stepsMin,
    stepsRange: [s.stepsMin, s.stepsMax],
    budget: veg ? s.budgetVegInr : s.budgetNonvegInr,
  };
}
