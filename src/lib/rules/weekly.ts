/** Weekly report data (Sunday evening / Monday fallback). */
import type { Settings } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { loadAllHistory } from "@/lib/metrics/strength";
import {
  adherenceFrom, loadDailyTotals, loadLoggedSessionDates, loadMeasurements, loadWeightSeries, weeklyRateFrom, weeklyVerdictFrom,
  type Adherence, type WeeklyRate, type WeeklyVerdict,
} from "@/lib/metrics/trends";

export type WeeklyReport = {
  weekStart: string;
  weekEnd: string;
  rate: WeeklyRate | null;
  navel: { prev: number | null; latest: number; delta: number | null } | null;
  lifts: { progressed: number; tracked: number };
  sessionsDone: number;
  adherence: Adherence;
  verdict: WeeklyVerdict;
};

export async function buildWeeklyReport(weekStart: string, settings: Settings): Promise<WeeklyReport> {
  const weekEnd = addDays(weekStart, 6);
  const [series, measurements, totals, sessionDates, history] = await Promise.all([
    loadWeightSeries(),
    loadMeasurements(),
    loadDailyTotals(addDays(weekStart, -1), weekEnd),
    loadLoggedSessionDates(weekStart, weekEnd),
    loadAllHistory(),
  ]);

  const navels = measurements.filter((m) => m.navelCm !== null);
  const thisWeek = navels.filter((m) => m.date >= weekStart && m.date <= weekEnd);
  const latest = thisWeek[thisWeek.length - 1];
  const prev = latest ? [...navels].reverse().find((m) => m.date < weekStart) : undefined;
  const navel = latest ? { prev: prev?.navelCm ?? null, latest: latest.navelCm!, delta: prev ? Math.round((latest.navelCm! - prev.navelCm!) * 10) / 10 : null } : null;

  // Lifts: exercises trained this week; progressed when this week's best beats the last session before the week.
  let progressed = 0, tracked = 0;
  for (const h of history) {
    const inWeek = h.points.filter((p) => p.date >= weekStart && p.date <= weekEnd);
    const before = h.points.filter((p) => p.date < weekStart);
    if (!inWeek.length || !before.length) continue;
    tracked++;
    if (Math.max(...inWeek.map((p) => p.e1rm)) > before[before.length - 1].e1rm) progressed++;
  }

  const seriesToWeekEnd = series.filter((p) => p.date <= weekEnd);
  return {
    weekStart,
    weekEnd,
    rate: weeklyRateFrom(seriesToWeekEnd),
    navel,
    lifts: { progressed, tracked },
    sessionsDone: sessionDates.length,
    adherence: adherenceFrom(totals, settings, weekStart, weekEnd),
    verdict: weeklyVerdictFrom({ series: seriesToWeekEnd, measurements, totals, today: weekEnd }),
  };
}
