/** Lazy, memoised metric loaders for rule conditions and messages. */
import { asc, eq } from "drizzle-orm";
import { exercises, routineExercises, type Measurement, type Settings } from "@/db/schema";
import { addDays, type IstNow } from "@/lib/dates";
import { forUser, type UserId } from "@/lib/db/scope";
import { listFoods, type Food } from "@/lib/food";
import { checkpointSummary, type CheckpointSummary } from "@/lib/metrics/checkpoint";
import { monthSpend, type MonthSpend } from "@/lib/metrics/spend";
import { loadLastSessionSets, type LastSession } from "@/lib/metrics/strength";
import { loadMeasurements, mondayOf, weeklyRate, weeklyVerdict, type WeeklyRate, type WeeklyVerdict } from "@/lib/metrics/trends";
import { listRoutineExerciseNames } from "@/lib/training";
import type { DayState } from "./dayState";
import { buildWeeklyReport, type WeeklyReport } from "./weekly";

export type TopSet = { name: string; weightKg: number; reps: number };

export type Loaders = {
  foods: () => Promise<Food[]>;
  spend: () => Promise<MonthSpend>;
  rate: () => Promise<WeeklyRate | null>;
  verdict: () => Promise<WeeklyVerdict>;
  measurements: () => Promise<Measurement[]>;
  /** Measurements dated within the ISO week containing `date` (default today). */
  measurementsInWeek: (date?: string) => Promise<Measurement[]>;
  /** A workout type's exercises with the top set from their last session (exercises never done are omitted). */
  typeTopSets: (typeId: number) => Promise<TopSet[]>;
  typeExerciseNames: (typeId: number) => Promise<string[]>;
  weeklyReport: (weekStart: string) => Promise<WeeklyReport>;
  checkpoint: (from: string, to: string) => Promise<CheckpointSummary>;
};

function memo<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= fn());
}

function memoBy<K, T>(cache: Map<K, Promise<T>>, key: K, fn: () => Promise<T>): Promise<T> {
  let p = cache.get(key);
  if (!p) cache.set(key, (p = fn()));
  return p;
}

export function makeLoaders(userId: UserId, now: IstNow, settings: Settings, state: DayState): Loaders {
  const u = forUser(userId);
  const foods = memo(() => listFoods(userId));
  const measurements = memo(() => loadMeasurements(userId));
  const weeklyReports = new Map<string, Promise<WeeklyReport>>();
  const checkpoints = new Map<string, Promise<CheckpointSummary>>();
  const names = new Map<number, Promise<string[]>>();
  const tops = new Map<number, Promise<TopSet[]>>();

  return {
    foods,
    spend: memo(() => monthSpend(userId, now.date, { settings })),
    rate: memo(() => weeklyRate(userId, settings.goal)),
    verdict: memo(() => weeklyVerdict(userId, settings.goal)),
    measurements,
    measurementsInWeek: async (date = now.date) => {
      const start = mondayOf(date);
      const end = addDays(start, 6);
      return (await measurements()).filter((m) => m.date >= start && m.date <= end);
    },
    typeExerciseNames: (typeId) => memoBy(names, typeId, async () => (await listRoutineExerciseNames(userId, typeId)).map((r) => r.name)),
    typeTopSets: (typeId) =>
      memoBy(tops, typeId, async () => {
        const rows = await u.db
          .select({ id: exercises.id, name: exercises.name })
          .from(routineExercises)
          .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
          .where(u.own(routineExercises, eq(routineExercises.routineDayId, typeId)))
          .orderBy(asc(routineExercises.sortOrder));
        const last = await loadLastSessionSets(userId, rows.map((r) => r.id), state.flags.sessionId ?? undefined);
        return rows.flatMap((r) => {
          const l: LastSession | undefined = last.get(r.id);
          if (!l || l.sets.length === 0) return [];
          const top = l.sets.reduce((a, b) => (b.weightKg * (1 + b.reps / 30) > a.weightKg * (1 + a.reps / 30) ? b : a));
          return [{ name: r.name, weightKg: top.weightKg, reps: top.reps }];
        });
      }),
    weeklyReport: (weekStart) => memoBy(weeklyReports, weekStart, () => buildWeeklyReport(userId, weekStart, settings)),
    checkpoint: (from, to) => memoBy(checkpoints, `${from}..${to}`, () => checkpointSummary(userId, from, to, { settings })),
  };
}
