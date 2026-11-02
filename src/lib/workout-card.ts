/**
 * Data for "Today's workout" (the card at the top of Today and Train) and the session-length estimate the morning
 * brief shows. Reads DayState for the plan; adds the next type's shape (exercises, sets, dominant muscle group), the
 * last top set of its first two lifts, and a rest-day suggestion drawn from the cardio log.
 */
import type { Settings } from "@/db/schema";
import { loadCardioSince } from "@/lib/activities";
import { CARDIO_TYPES, type CardioEntry } from "@/lib/cardio";
import { addDays } from "@/lib/dates";
import type { UserId } from "@/lib/db/scope";
import { FINISHER_MINUTES } from "@/lib/home-program";
import { isBodyweight, loadLastSessionSets } from "@/lib/metrics/strength";
import { dominantGroup, homeDaySubtitle } from "@/lib/routine";
import type { DayState } from "@/lib/rules/dayState";
import { listRoutineExercises, sessionProgress } from "@/lib/training";

export type TopSet = { name: string; weightKg: number; reps: number; /** Bodyweight rows: "12/12/11" with the measure's unit. */ bodyweight: boolean; measure: "reps" | "seconds" };

export type WorkoutCardData =
  /** No active workout types: home users build Day A/B/C from here (one question first); gym users add a type in Settings. */
  | { kind: "setup"; home: boolean }
  | { kind: "rest"; steps: number | null; stepsRange: [number, number]; suggestion: string }
  /** Day not set: the next type in rotation as the hero. */
  | { kind: "next"; typeId: number; typeName: string; subtitle: string | null; group: string; exerciseCount: number; estMinutes: number; daysSince: number | null; topSets: TopSet[] }
  /** Started or logged: progress. */
  | { kind: "active"; typeName: string; subtitle: string | null; group: string | null; logged: number; total: number; sessionId: number };

/** The user's `session_minutes`, else sets × 2.5 min rounded to 5 (at least 15). */
export function estimateMinutes(sessionMinutes: number | null, totalSets: number): number {
  if (sessionMinutes) return sessionMinutes;
  return Math.max(15, Math.round((totalSets * 2.5) / 5) * 5);
}

/** Bodyweight types: 2 min a set plus the finisher's 10, whatever `session_minutes` says (the plan sets the length). */
export function estimateBodyweightMinutes(bodyweightSets: number, finishers: number): number {
  return bodyweightSets * 2 + finishers * FINISHER_MINUTES;
}

type TypeShape = { exerciseCount: number; totalSets: number; bodyweightSets: number; finishers: number; group: string; firstTwo: { id: number; name: string; bodyweight: boolean; measure: "reps" | "seconds" }[] };

async function typeShape(userId: UserId, typeId: number): Promise<TypeShape> {
  const rows = (await listRoutineExercises(userId)).filter((r) => r.routineDayId === typeId);
  const bw = rows.filter((r) => isBodyweight(r.equipment) && r.pattern !== "conditioning");
  return {
    exerciseCount: rows.length,
    totalSets: rows.reduce((s, r) => s + r.targetSets, 0),
    bodyweightSets: bw.reduce((s, r) => s + r.targetSets, 0),
    finishers: rows.filter((r) => r.pattern === "conditioning").length,
    group: dominantGroup(rows.filter((r) => r.pattern !== "conditioning").map((r) => r.muscleGroup)),
    firstTwo: rows.filter((r) => r.pattern !== "conditioning").slice(0, 2).map((r) => ({ id: r.exerciseId, name: r.name, bodyweight: isBodyweight(r.equipment), measure: r.measure })),
  };
}

const minutesFor = (shape: TypeShape, settings: Pick<Settings, "sessionMinutes">) =>
  shape.bodyweightSets > 0 ? estimateBodyweightMinutes(shape.bodyweightSets, shape.finishers) : estimateMinutes(settings.sessionMinutes, shape.totalSets);

export async function estimateTypeMinutes(userId: UserId, typeId: number, settings: Pick<Settings, "sessionMinutes">): Promise<number> {
  return minutesFor(await typeShape(userId, typeId), settings);
}

const WEEKDAY = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "long" });

/** "20-minute walk, like last Wednesday." from the most recent cardio before `date`, or a default. */
export function restSuggestion(history: CardioEntry[], date: string): string {
  const before = history.filter((e) => e.date < date).sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = before[before.length - 1];
  if (!last) return "A 20-minute walk counts. Log it on Train when you're back.";
  const what = last.type === "sport" ? last.name.toLowerCase() : CARDIO_TYPES[last.type].label.toLowerCase();
  return `${last.minutes}-minute ${what}, like last ${WEEKDAY.format(new Date(`${last.date}T00:00:00Z`))}.`;
}

export async function loadWorkoutCard(userId: UserId, date: string, state: DayState, settings: Settings): Promise<WorkoutCardData> {
  const plan = state.dayPlan;
  if (plan.kind === "rest") {
    // Home users get the brisk walk every rest day; the steps target stays. Gym users get their own recent cardio.
    const suggestion = settings.trainingLocation === "home" ? "A brisk 20–30 minute walk. The steps target stays." : restSuggestion(await loadCardioSince(userId, addDays(date, -56)), date);
    return { kind: "rest", steps: state.metrics.steps, stepsRange: state.targets.stepsRange, suggestion };
  }
  if (state.flags.sessionId && (plan.kind === "workout" || plan.kind === "custom")) {
    const [progress, shape] = await Promise.all([sessionProgress(userId, state.flags.sessionId), plan.typeId !== null ? typeShape(userId, plan.typeId) : null]);
    return { kind: "active", typeName: plan.typeName ?? "Custom workout", subtitle: plan.typeName ? homeDaySubtitle(plan.typeName) : null, group: shape?.group ?? null, logged: progress.logged, total: progress.total, sessionId: state.flags.sessionId };
  }
  const next = state.nextUp;
  if (!next) return { kind: "setup", home: settings.trainingLocation === "home" };
  const shape = await typeShape(userId, next.typeId);
  const last = await loadLastSessionSets(userId, shape.firstTwo.map((e) => e.id));
  const topSets = shape.firstTwo.flatMap((e) => {
    const l = last.get(e.id);
    if (!l || l.sets.length === 0) return [];
    const top = l.sets.reduce((a, b) => (e.bodyweight ? b.reps > a.reps : b.weightKg * (1 + b.reps / 30) > a.weightKg * (1 + a.reps / 30)) ? b : a);
    return [{ name: e.name, weightKg: top.weightKg, reps: top.reps, bodyweight: e.bodyweight, measure: e.measure }];
  });
  return {
    kind: "next",
    typeId: next.typeId,
    typeName: next.typeName,
    subtitle: homeDaySubtitle(next.typeName),
    group: shape.group,
    exerciseCount: shape.exerciseCount,
    estMinutes: minutesFor(shape, settings),
    daysSince: state.daysSince.find((d) => d.typeId === next.typeId)?.days ?? null,
    topSets,
  };
}
