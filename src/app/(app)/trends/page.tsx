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
import { getSettings } from "@/lib/settings";
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
  const today = todayIST();
  const from = addDays(mondayOf(today), -7 * (WEEKS - 1));

  const [settings, series, measurements, totals, sessionDates, history, volume, cardioWeeks, cardioEntries] = await Promise.all([
    getSettings(),
    loadWeightSeries(),
    loadMeasurements(),
    loadDailyTotals(from, today),
    loadLoggedSessionDates(from, today),
    loadAllHistory(),
    weeklySetsByMuscle(4, today),
    cardioByWeek(8, today),
    loadCardioSince(addDays(today, -180)),
  ]);

  const onboardingDate = settings.onboardedAt ? todayIST(settings.onboardedAt) : settings.smokeFreeSince ?? today;
  const daysToCheckpoint = daysBetween(today, settings.checkpointDate);
  const checkpointTo = daysToCheckpoint < 0 ? settings.checkpointDate : today;

  const [spend, checkpoint] = await Promise.all([
    monthSpend(today, { settings }),
    checkpointSummary(onboardingDate, checkpointTo, { settings, series, measurements, history }),
  ]);

  const rate = weeklyRateFrom(series);
  const weeks = adherenceByWeekFrom({ settings, totals, sessionDates, weeks: WEEKS, today });
  const verdict = weeklyVerdictFrom({ series, measurements, totals, today });
  const maintenance = estimateMaintenanceFrom({ series, totals, today });

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
  const checkpointSoon = daysToCheckpoint >= -7 && daysToCheckpoint <= 14;
  const maintenanceActionable = maintenance !== null && Math.abs(maintenance.suggestedTarget - settings.kcalTarget) >= 50;
  const checkpointCard = <CheckpointCard summary={checkpoint} checkpointDate={settings.checkpointDate} daysToGo={daysToCheckpoint} />;
  const maintenanceCard = maintenance ? <MaintenanceCard data={maintenance} currentTarget={settings.kcalTarget} /> : null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold">Trends</h1>
      <VerdictCard verdict={verdict} />
      {checkpointSoon ? checkpointCard : null}
      {maintenanceActionable ? maintenanceCard : null}
      <WeightSection series={series} rate={rate} today={today} />
      <NavelSection measurements={measurements} settings={settings} today={today} />
      <Measurements items={measurements} today={today} />

      <details className="group">
        <summary className="flex h-12 cursor-pointer list-none items-center justify-center gap-2 rounded-2xl border border-border bg-surface text-sm font-medium text-muted [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">More details</span>
          <span className="hidden group-open:inline">Hide details</span>
          <span aria-hidden className="transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <GoalCard settings={settings} measurements={measurements} today={today} />
          <LiftsSection lifts={lifts} />
          <MuscleVolume weeks={volume} />
          <CardioSection weeks={cardioWeeks.map(({ weekStart, minutes }) => ({ weekStart, minutes }))} entries={cardioEntries} />
          <AdherenceTable weeks={weeks} />
          {!maintenanceActionable ? maintenanceCard : null}
          {!checkpointSoon ? checkpointCard : null}
          <SpendSection spend={spend} />
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
