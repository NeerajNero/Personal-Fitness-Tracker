import type { Metadata } from "next";
import { addDays, todayIST } from "@/lib/dates";
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
import { MaintenanceCard } from "./maintenance-card";
import { Measurements } from "./measurements";
import { NavelSection } from "./navel-section";
import { VerdictCard } from "./verdict-card";
import { WeightSection } from "./weight-section";

export const metadata: Metadata = { title: "Trends" };

const WEEKS = 12;

export default async function TrendsPage() {
  const today = todayIST();
  const from = addDays(mondayOf(today), -7 * (WEEKS - 1));

  const [settings, series, measurements, totals, sessionDates] = await Promise.all([
    getSettings(),
    loadWeightSeries(),
    loadMeasurements(),
    loadDailyTotals(from, today),
    loadLoggedSessionDates(from, today),
  ]);

  const rate = weeklyRateFrom(series);
  const weeks = adherenceByWeekFrom({ settings, totals, sessionDates, weeks: WEEKS, today });
  const verdict = weeklyVerdictFrom({ series, measurements, totals, today });
  const maintenance = estimateMaintenanceFrom({ series, totals, today });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Trends</h1>
      <WeightSection series={series} rate={rate} today={today} />
      <Measurements items={measurements} today={today} />
      <NavelSection measurements={measurements} settings={settings} today={today} />
      <AdherenceTable weeks={weeks} />
      <VerdictCard verdict={verdict} />
      {maintenance ? <MaintenanceCard data={maintenance} currentTarget={settings.kcalTarget} /> : null}
    </div>
  );
}
