/** Client-safe constants (no db import). */
/** Legacy Upper/Lower rows store compact names; everything else displays as stored. */
const LEGACY_LABEL: Record<string, string> = { UpperA: "Upper A", LowerA: "Lower A", UpperB: "Upper B", LowerB: "Lower B" };

/** Display name for a workout type (routine_days.name). */
export function typeLabel(name: string): string {
  return LEGACY_LABEL[name] ?? name;
}

/** Reserved bot words — a workout type with one of these names could never be sent as a command. */
export const BOT_COMMAND_WORDS = [
  "w", "s", "water", "done", "today", "undo", "help", "start", "diag", "copy", "same", "navel", "waist", "rest", "custom",
  "cardio", "walk", "incline", "run", "cycle", "bike", "cross", "stairs", "swim", "sport",
] as const;

/** A workout type as the day picker shows it. */
export type PickerType = { id: number; label: string; archived: boolean; days: number | null };

/** Picker rows from all workout types + DayState.daysSince (archived types have no "days since"). */
export function pickerTypes(types: { id: number; label: string; archived: boolean }[], daysSince: { typeId: number; days: number | null }[]): PickerType[] {
  const days = new Map(daysSince.map((d) => [d.typeId, d.days]));
  return types.map((t) => ({ id: t.id, label: t.label, archived: t.archived, days: days.get(t.id) ?? null }));
}

/* ------------------------------ home program ------------------------------ */

/** The three home days in rotation order, with the subtitle the workout card shows. */
export const HOME_DAYS = [
  { name: "Day A", subtitle: "push and squat" },
  { name: "Day B", subtitle: "pull and hinge" },
  { name: "Day C", subtitle: "shoulders, legs and conditioning" },
] as const;
export const HOME_DAY_NAMES = HOME_DAYS.map((d) => d.name) as readonly string[];

export function homeDaySubtitle(name: string): string | null {
  return HOME_DAYS.find((d) => d.name.toLowerCase() === name.toLowerCase())?.subtitle ?? null;
}

/** True when the active types are exactly Day A, Day B, Day C in order: the weekly pattern decides "next up". */
export function isHomePlan(activeNames: string[]): boolean {
  return activeNames.length === 3 && activeNames.every((n, i) => n.toLowerCase() === HOME_DAY_NAMES[i].toLowerCase());
}

/** A week of home days for `daysPerWeek` sessions: 3 → A B C, 4 → A B C A, 5 → A B C A B. */
export function weeklyPattern(daysPerWeek: number): string[] {
  const n = Math.min(7, Math.max(1, daysPerWeek || 3));
  return Array.from({ length: n }, (_, i) => HOME_DAY_NAMES[i % 3]);
}

/** Which home day comes next given how many sessions were trained earlier this ISO week. */
export function homeNextName(trainedThisWeek: number, daysPerWeek: number): string {
  const p = weeklyPattern(daysPerWeek);
  return p[trainedThisWeek % p.length];
}

/** The one onboarding question for the home plan: push-ups in a row → the starting push-up rung. */
export const PUSHUP_ANSWERS = ["0", "1-5", "6-15", "16+"] as const;
export type PushupAnswer = (typeof PUSHUP_ANSWERS)[number];
export const PUSHUP_LABEL: Record<PushupAnswer, string> = { "0": "None yet", "1-5": "1 to 5", "6-15": "6 to 15", "16+": "16 or more" };

/** Bodyweight rep ranges (docs/home-program.md): reps 8–15, holds 20–45 s. */
export const BW_RANGE = { reps: { bottom: 8, top: 15, step: 2 }, seconds: { bottom: 20, top: 45, step: 5 } } as const;

/** The muscle group most of a list of exercises train (a workout type's icon). */
export function dominantGroup(groups: string[]): string {
  const counts = new Map<string, number>();
  for (const g of groups) counts.set(g, (counts.get(g) ?? 0) + 1);
  let best = "other";
  let n = 0;
  for (const [g, c] of counts) if (c > n) [best, n] = [g, c];
  return best;
}

export const MUSCLE_GROUPS = [
  "back", "chest", "shoulders", "rear delts", "biceps", "triceps",
  "quads", "hamstrings", "glutes", "calves", "posterior chain", "core", "other",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
