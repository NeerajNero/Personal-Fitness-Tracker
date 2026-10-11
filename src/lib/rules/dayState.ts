/**
 * getDayState — the single source of truth for "where am I today".
 * Both the UI chips and the Telegram bot read from this. Never duplicate this logic.
 *
 * `foodLoggedSince` is a function, so strip it (or pick fields) before passing
 * a DayState to a client component.
 */
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { dailyMetrics, foodLog, routineDays, sessions, type Settings } from "@/db/schema";
import { daysBetween, isoWeekday } from "@/lib/dates";
import { getTargets, type Targets } from "@/lib/metrics/phase";
import { getSettings } from "@/lib/settings";

export type RoutineDayName = "UpperA" | "LowerA" | "UpperB" | "LowerB";

export type DayState = {
  /** IST calendar date "YYYY-MM-DD". */
  date: string;
  targets: Targets;
  totals: { kcal: number; protein: number; cost: number; entries: number };
  /** Negative when over target. Protein is measured against the phase minimum. */
  remaining: { kcal: number; protein: number };
  metrics: { weightKg: number | null; steps: number | null; waterGlasses: number | null };
  flags: {
    weightLogged: boolean;
    stepsLogged: boolean;
    isTrainingDay: boolean;
    routineDayName: RoutineDayName | null;
    routineDayId: number | null;
    workoutLogged: boolean;
    sessionId: number | null;
    /** "HH:MM:SS" IST of the latest food entry, or null. */
    lastFoodAt: string | null;
    /** True if any food was logged at or after `time` ("HH:MM" or "HH:MM:SS"). */
    foodLoggedSince: (time: string) => boolean;
  };
  /** Days since settings.smoke_free_since, or null when unset. */
  smokeFreeDays: number | null;
};

export async function getDayState(date: string, opts: { settings?: Settings } = {}): Promise<DayState> {
  const weekday = isoWeekday(date);

  const [s, totals, metrics, routineDay, session] = await Promise.all([
    opts.settings ? Promise.resolve(opts.settings) : getSettings(),
    db
      .select({
        kcal: sql<number>`coalesce(sum(${foodLog.kcal}), 0)::float`,
        protein: sql<number>`coalesce(sum(${foodLog.proteinG}), 0)::float`,
        cost: sql<number>`coalesce(sum(${foodLog.costInr}), 0)::float`,
        entries: sql<number>`count(*)::int`,
        lastFoodAt: sql<string | null>`max(${foodLog.time})::text`,
      })
      .from(foodLog)
      .where(eq(foodLog.date, date))
      .then((r) => r[0]),
    db
      .select()
      .from(dailyMetrics)
      .where(eq(dailyMetrics.date, date))
      .then((r) => r[0] ?? null),
    db
      .select({ id: routineDays.id, name: routineDays.name })
      .from(routineDays)
      .where(eq(routineDays.weekday, weekday))
      .then((r) => r[0] ?? null),
    db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.date, date))
      .orderBy(desc(sessions.id))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  const targets = getTargets(date, s);
  const lastFoodAt = totals.lastFoodAt;

  return {
    date,
    targets,
    totals: { kcal: totals.kcal, protein: totals.protein, cost: totals.cost, entries: totals.entries },
    remaining: { kcal: targets.kcal - totals.kcal, protein: targets.proteinMin - totals.protein },
    metrics: {
      weightKg: metrics?.weightKg ?? null,
      steps: metrics?.steps ?? null,
      waterGlasses: metrics?.waterGlasses ?? null,
    },
    flags: {
      weightLogged: metrics?.weightKg != null,
      stepsLogged: metrics?.steps != null,
      isTrainingDay: routineDay !== null,
      routineDayName: routineDay?.name ?? null,
      routineDayId: routineDay?.id ?? null,
      workoutLogged: session !== null,
      sessionId: session?.id ?? null,
      lastFoodAt,
      foodLoggedSince: (time) => lastFoodAt !== null && lastFoodAt >= time,
    },
    smokeFreeDays: s.smokeFreeSince ? Math.max(0, daysBetween(s.smokeFreeSince, date)) : null,
  };
}

export const ROUTINE_LABEL: Record<RoutineDayName, string> = {
  UpperA: "Upper A",
  LowerA: "Lower A",
  UpperB: "Upper B",
  LowerB: "Lower B",
};
