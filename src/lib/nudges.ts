/** Settings toggles for the rules engine (client-safe). */
export const NUDGE_TOGGLES = [
  "nudgeMorningBrief",
  "nudgeLunchCheck",
  "nudgeProteinCheck",
  "nudgeKcalCheck",
  "nudgeDayClose",
  "nudgeWater",
  "nudgeWeeklyMeasure",
  "nudgeBudget",
  "nudgeMilestones",
] as const;
export type NudgeToggle = (typeof NUDGE_TOGGLES)[number];
