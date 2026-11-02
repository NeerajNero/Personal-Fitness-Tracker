import type { Metadata } from "next";
import Link from "next/link";
import { addDays, daysBetween, todayIST } from "@/lib/dates";
import { checkpointSummary } from "@/lib/metrics/checkpoint";
import { monthSpend } from "@/lib/metrics/spend";
import { loadAllHistory, stallFromHistory, stallIndices, weeklySetsByMuscle } from "@/lib/metrics/strength";
import {
  adherenceByWeekFrom,
  estimateMaintenanceFrom,
  loadDailyTotals,
  loadLoggedSessionDates,
  loadMeasurements,
  loadWeightSeries,
  mondayOf,
  weeklyRateFrom,
  weeklyVerdictFrom,
} from "@/lib/metrics/trends";
import { onboardingDate as profileStart } from "@/lib/rules/rules";
import { requireUser } from "@/lib/session";
import { getSettings, hasBudgets, hasNavelGoal } from "@/lib/settings";
import { AdherenceTable } from "./adherence-table";
import { CheckpointCard } from "./checkpoint-card";
import { GoalCard } from "./goal-card";
import { LiftsSection, type Lift } from "./lifts-section";
import { MaintenanceCard } from "./maintenance-card";
import { cardioByWeek, loadCardioSince } from "@/lib/activities";
import { CardioSection } from "./cardio-section";
import { Measurements } from "./measurements";
import { MuscleVolume } from "./muscle-volume";
import { NavelSection } from "./navel-section";
import { SpendSection } from "./spend-section";
import { VerdictCard } from "./verdict-card";
import { WeightSection } from "./weight-section";

export const metadata: Metadata = { title: "Trends" };

const WEEKS = 12;

export default async function TrendsPage() {
  const userId = await requireUser();
  const today = todayIST();
  const from = addDays(mondayOf(today), -7 * (WEEKS - 1));

  const [settings, series, measurements, totals, sessionDates, history, volume, cardioWeeks, cardioEntries] = await Promise.all([
    getSettings(userId),
    loadWeightSeries(userId),
    loadMeasurements(userId),
    loadDailyTotals(userId, from, today),
    loadLoggedSessionDates(userId, from, today),
    loadAllHistory(userId),
    weeklySetsByMuscle(userId, 4, today),
    cardioByWeek(userId, 8, today),
    loadCardioSince(userId, addDays(today, -180)),
  ]);

  // Owner-only cards: the checkpoint review needs a date, spend needs budgets, the navel goal needs its numbers.
  const checkpointDate = settings.checkpointDate;
  const daysToCheckpoint = checkpointDate ? daysBetween(today, checkpointDate) : null;
  const checkpointTo = checkpointDate && daysToCheckpoint !== null && daysToCheckpoint < 0 ? checkpointDate : today;

  const [spend, checkpoint] = await Promise.all([
    hasBudgets(settings) ? monthSpend(userId, today, { settings }) : null,
    checkpointDate ? checkpointSummary(userId, profileStart(settings, today), checkpointTo, { settings, series, measurements, history }) : null,
  ]);

  const rate = weeklyRateFrom(series, 14, settings.goal);
  const weeks = adherenceByWeekFrom({ settings, totals, sessionDates, weeks: WEEKS, today });
  const verdict = weeklyVerdictFrom({ series, measurements, totals, today, goal: settings.goal });
  const maintenance = estimateMaintenanceFrom({ series, totals, today, goal: settings.goal });

  const lifts: Lift[] = history
    .filter((h) => h.points.length >= 2)
    .map((h) => {
      const first = h.points[0].e1rm;
      const latest = h.points[h.points.length - 1].e1rm;
      return {
        exerciseId: h.exerciseId,
        name: h.name,
        points: h.points,
        stall: stallFromHistory(h.points),
        stallIdx: [...stallIndices(h.points)],
        first,
        latest,
        deltaPct: first > 0 ? Math.round(((latest - first) / first) * 1000) / 10 : 0,
      };
    });

  // Time-bound or actionable cards jump to the top; everything else waits under "More".
  const checkpointSoon = daysToCheckpoint !== null && daysToCheckpoint >= -7 && daysToCheckpoint <= 14;
  const maintenanceActionable = maintenance !== null && Math.abs(maintenance.suggestedTarget - settings.kcalTarget) >= 50;
  const checkpointCard = checkpoint && checkpointDate && daysToCheckpoint !== null ? <CheckpointCard summary={checkpoint} checkpointDate={checkpointDate} daysToGo={daysToCheckpoint} /> : null;
  const maintenanceCard = maintenance ? <MaintenanceCard data={maintenance} currentTarget={settings.kcalTarget} goal={settings.goal} /> : null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold">Trends</h1>
      <VerdictCard verdict={verdict} />
      {checkpointSoon ? checkpointCard : null}
      {maintenanceActionable ? maintenanceCard : null}
      <WeightSection series={series} rate={rate} today={today} goal={settings.goal} />
      {hasNavelGoal(settings) ? <NavelSection measurements={measurements} settings={settings} today={today} /> : null}
      <Measurements items={measurements} today={today} />

      <details className="group">
        <summary className="flex h-12 cursor-pointer list-none items-center justify-center gap-2 rounded-2xl border border-border bg-surface text-sm font-medium text-muted [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">More details</span>
          <span className="hidden group-open:inline">Hide details</span>
          <span aria-hidden className="transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          {hasNavelGoal(settings) ? <GoalCard settings={settings} measurements={measurements} today={today} /> : null}
          <LiftsSection lifts={lifts} />
          <MuscleVolume weeks={volume} />
          <CardioSection weeks={cardioWeeks.map(({ weekStart, minutes }) => ({ weekStart, minutes }))} entries={cardioEntries} />
          <AdherenceTable weeks={weeks} />
          {!maintenanceActionable ? maintenanceCard : null}
          {!checkpointSoon ? checkpointCard : null}
          {spend ? <SpendSection spend={spend} /> : null}
          <p className="pb-2 text-center text-sm">
            <Link href="/settings#export" className="text-accent">
              Export data (CSV)
            </Link>
          </p>
        </div>
      </details>
    </div>
  );
}
