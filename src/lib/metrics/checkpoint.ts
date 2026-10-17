/** Window summary for the Dec 10 checkpoint card and the Telegram checkpoint rule. */
import type { Measurement, Settings } from "@/db/schema";
import { loadAllHistory, type ExerciseHistory } from "@/lib/metrics/strength";
import { adherenceFrom, loadDailyTotals, loadLoggedSessionDates, loadMeasurements, loadWeightSeries, type Adherence, type DailyTotal, type WeightPoint } from "@/lib/metrics/trends";
import { getSettings } from "@/lib/settings";

export type LiftProgress = {
  exerciseId: number;
  name: string;
  sessions: number;
  firstE1rm: number;
  latestE1rm: number;
  deltaPct: number;
  progressed: boolean;
};

export type CheckpointSummary = {
  from: string;
  to: string;
  days: number;
  navel: { first: number; latest: number; delta: number } | null;
  weight: { first: number; latest: number; delta: number } | null; // 7-day averages
  lifts: { progressed: number; tracked: number; details: LiftProgress[] };
  sessionsDone: number;
  sessionsPlanned: number;
} & Adherence;

export const LIFT_MIN_SESSIONS = 3;

export function liftProgressFrom(history: ExerciseHistory[], from: string, to: string): LiftProgress[] {
  return history
    .map((h) => {
      const pts = h.points.filter((p) => p.date >= from && p.date <= to);
      if (pts.length < LIFT_MIN_SESSIONS) return null;
      const first = pts[0].e1rm;
      const latest = pts[pts.length - 1].e1rm;
      return {
        exerciseId: h.exerciseId,
        name: h.name,
        sessions: pts.length,
        firstE1rm: first,
        latestE1rm: latest,
        deltaPct: first > 0 ? Math.round(((latest - first) / first) * 1000) / 10 : 0,
        progressed: latest > first,
      };
    })
    .filter((x): x is LiftProgress => x !== null);
}

/** Sessions expected in an inclusive window at `weeklyTarget` per week (pro-rated, rounded). */
export function plannedSessions(days: number, weeklyTarget: number): number {
  return Math.round((days / 7) * weeklyTarget);
}

export function checkpointSummaryFrom(input: {
  from: string;
  to: string;
  settings: Settings;
  series: WeightPoint[];
  measurements: Measurement[];
  history: ExerciseHistory[];
  totals: DailyTotal[];
  sessionDates: string[];
}): CheckpointSummary {
  const { from, to, settings, series, measurements, history, totals, sessionDates } = input;
  const navels = measurements.filter((m) => m.navelCm !== null && m.date >= from && m.date <= to);
  const w = series.filter((p) => p.date >= from && p.date <= to);
  const details = liftProgressFrom(history, from, to);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const days = Math.max(0, (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return {
    from,
    to,
    days,
    navel: navels.length ? { first: navels[0].navelCm!, latest: navels[navels.length - 1].navelCm!, delta: r1(navels[navels.length - 1].navelCm! - navels[0].navelCm!) } : null,
    weight: w.length ? { first: r1(w[0].avg7), latest: r1(w[w.length - 1].avg7), delta: r1(w[w.length - 1].avg7 - w[0].avg7) } : null,
    lifts: { progressed: details.filter((d) => d.progressed).length, tracked: details.length, details },
    sessionsDone: sessionDates.filter((d) => d >= from && d <= to).length,
    sessionsPlanned: plannedSessions(days, settings.weeklySessionTarget),
    ...adherenceFrom(totals, settings, from, to),
  };
}

/** Loads whatever `pre` doesn't supply. Totals and session dates for the window are always loaded. */
export async function checkpointSummary(
  from: string,
  to: string,
  pre: Partial<{ settings: Settings; series: WeightPoint[]; measurements: Measurement[]; history: ExerciseHistory[] }> = {},
): Promise<CheckpointSummary> {
  const [settings, series, measurements, history, totals, sessionDates] = await Promise.all([
    pre.settings ?? getSettings(),
    pre.series ?? loadWeightSeries(),
    pre.measurements ?? loadMeasurements(),
    pre.history ?? loadAllHistory(),
    loadDailyTotals(from, to),
    loadLoggedSessionDates(from, to),
  ]);
  return checkpointSummaryFrom({ from, to, settings, series, measurements, history, totals, sessionDates });
}
