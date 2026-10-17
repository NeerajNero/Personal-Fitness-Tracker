/** Client-safe constants (no db import). */
/** Legacy Upper/Lower rows store compact names; everything else displays as stored. */
const LEGACY_LABEL: Record<string, string> = { UpperA: "Upper A", LowerA: "Lower A", UpperB: "Upper B", LowerB: "Lower B" };

/** Display name for a workout type (routine_days.name). */
export function typeLabel(name: string): string {
  return LEGACY_LABEL[name] ?? name;
}

/** Reserved bot words — a workout type with one of these names could never be sent as a command. */
export const BOT_COMMAND_WORDS = [
  "w", "s", "water", "done", "today", "undo", "help", "start", "copy", "same", "navel", "waist", "rest", "custom",
  "cardio", "walk", "incline", "run", "cycle", "bike", "cross", "stairs", "swim", "sport",
] as const;

/** A workout type as the day picker shows it. */
export type PickerType = { id: number; label: string; archived: boolean; days: number | null };

/** Picker rows from all workout types + DayState.daysSince (archived types have no "days since"). */
export function pickerTypes(types: { id: number; label: string; archived: boolean }[], daysSince: { typeId: number; days: number | null }[]): PickerType[] {
  const days = new Map(daysSince.map((d) => [d.typeId, d.days]));
  return types.map((t) => ({ id: t.id, label: t.label, archived: t.archived, days: days.get(t.id) ?? null }));
}

export const MUSCLE_GROUPS = [
  "back", "chest", "shoulders", "rear delts", "biceps", "triceps",
  "quads", "hamstrings", "glutes", "calves", "posterior chain", "core", "other",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
