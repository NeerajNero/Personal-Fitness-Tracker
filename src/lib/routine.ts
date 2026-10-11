/** Client-safe constants (no db import). */
export type RoutineDayName = "UpperA" | "LowerA" | "UpperB" | "LowerB";

export const ROUTINE_LABEL: Record<RoutineDayName, string> = {
  UpperA: "Upper A",
  LowerA: "Lower A",
  UpperB: "Upper B",
  LowerB: "Lower B",
};

export const MUSCLE_GROUPS = [
  "back", "chest", "shoulders", "rear delts", "biceps", "triceps",
  "quads", "hamstrings", "glutes", "calves", "posterior chain", "core", "other",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
