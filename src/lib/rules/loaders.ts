/** Lazy, memoised metric loaders for rule conditions and messages. */
import type { Measurement, Settings } from "@/db/schema";
import { addDays, type IstNow } from "@/lib/dates";
import { listFoods, type Food } from "@/lib/food";
import { checkpointSummary, type CheckpointSummary } from "@/lib/metrics/checkpoint";
import { monthSpend, type MonthSpend } from "@/lib/metrics/spend";
import { loadLastSessionSets, type LastSession } from "@/lib/metrics/strength";
import { loadMeasurements, mondayOf, weeklyRate, weeklyVerdict, type WeeklyRate, type WeeklyVerdict } from "@/lib/metrics/trends";
import { listRoutineExerciseNames } from "@/lib/training";
import type { DayState } from "./dayState";
import { buildWeeklyReport, type WeeklyReport } from "./weekly";
import { db } from "@/db";
import { exercises, routineExercises } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

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

export function makeLoaders(now: IstNow, settings: Settings, state: DayState): Loaders {
  const foods = memo(() => listFoods());
  const measurements = memo(() => loadMeasurements());
  const weeklyReports = new Map<string, Promise<WeeklyReport>>();
  const checkpoints = new Map<string, Promise<CheckpointSummary>>();
  const names = new Map<number, Promise<string[]>>();
  const tops = new Map<number, Promise<TopSet[]>>();

  return {
    foods,
    spend: memo(() => monthSpend(now.date, { settings })),
    rate: memo(() => weeklyRate()),
    verdict: memo(() => weeklyVerdict()),
    measurements,
    measurementsInWeek: async (date = now.date) => {
      const start = mondayOf(date);
      const end = addDays(start, 6);
      return (await measurements()).filter((m) => m.date >= start && m.date <= end);
    },
    typeExerciseNames: (typeId) => memoBy(names, typeId, async () => (await listRoutineExerciseNames(typeId)).map((r) => r.name)),
    typeTopSets: (typeId) =>
      memoBy(tops, typeId, async () => {
        const rows = await db
          .select({ id: exercises.id, name: exercises.name })
          .from(routineExercises)
          .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
          .where(eq(routineExercises.routineDayId, typeId))
          .orderBy(asc(routineExercises.sortOrder));
        const last = await loadLastSessionSets(rows.map((r) => r.id), state.flags.sessionId ?? undefined);
        return rows.flatMap((r) => {
          const l: LastSession | undefined = last.get(r.id);
          if (!l || l.sets.length === 0) return [];
          const top = l.sets.reduce((a, b) => (b.weightKg * (1 + b.reps / 30) > a.weightKg * (1 + a.reps / 30) ? b : a));
          return [{ name: r.name, weightKg: top.weightKg, reps: top.reps }];
        });
      }),
    weeklyReport: (weekStart) => {
      let p = weeklyReports.get(weekStart);
      if (!p) {
        p = buildWeeklyReport(weekStart, settings);
        weeklyReports.set(weekStart, p);
      }
      return p;
    },
    checkpoint: (from, to) => {
      const k = `${from}..${to}`;
      let p = checkpoints.get(k);
      if (!p) {
        p = checkpointSummary(from, to, { settings });
        checkpoints.set(k, p);
      }
      return p;
    },
  };
}
