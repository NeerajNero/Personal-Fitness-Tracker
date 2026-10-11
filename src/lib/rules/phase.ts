import type { Settings } from "@/db/schema";

export type Phase = "veg" | "nonveg";

/** Current protein phase: explicit override wins, else by date against phase_switch_date. */
export function currentPhase(s: Settings, todayIso: string): Phase {
  if (s.phaseOverride) return s.phaseOverride;
  return todayIso >= s.phaseSwitchDate ? "nonveg" : "veg";
}

export function proteinRange(s: Settings, phase: Phase): { min: number; max: number } {
  return phase === "veg"
    ? { min: s.proteinMinVeg, max: s.proteinMaxVeg }
    : { min: s.proteinMinNonveg, max: s.proteinMaxNonveg };
}

export function proteinBudgetInr(s: Settings, phase: Phase): number {
  return phase === "veg" ? s.budgetVegInr : s.budgetNonvegInr;
}
