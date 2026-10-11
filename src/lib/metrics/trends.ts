/**
 * Trend metrics. Loaders fetch; `*From` helpers are pure so the Trends page can
 * load each dataset once and derive everything. The parameterless exports load
 * their own data for callers like the bot and the weekly report.
 */
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { measurements, type Measurement, type Settings } from "@/db/schema";
import { addDays, daysBetween, isoWeekday, todayIST } from "@/lib/dates";
import { getTargets } from "@/lib/metrics/phase";
import { getSettings } from "@/lib/settings";

export type WeightPoint = { date: string; weightKg: number; avg7: number; nDays: number };
export type DailyTotal = { date: string; kcal: number; protein: number; cost: number; entries: number };

/* --------------------------------- loaders --------------------------------- */

export async function loadWeightSeries(): Promise<WeightPoint[]> {
  const res = await db.execute<{ date: string; weight_kg: number; weight_7d_avg: number; n_days: number }>(sql`
    select date::text as date, weight_kg::float as weight_kg, weight_7d_avg::float as weight_7d_avg, n_days::int as n_days
    from v_weight_7d order by date`);
  return res.rows.map((r) => ({ date: r.date, weightKg: r.weight_kg, avg7: r.weight_7d_avg, nDays: r.n_days }));
}

export async function loadDailyTotals(from: string, to: string): Promise<DailyTotal[]> {
  const res = await db.execute<{ date: string; kcal: number; protein_g: number; cost_inr: number; entries: number }>(sql`
    select date::text as date, kcal::float as kcal, protein_g::float as protein_g, cost_inr::float as cost_inr, entries
    from v_daily_totals where date between ${from} and ${to} order by date`);
  return res.rows.map((r) => ({ date: r.date, kcal: r.kcal, protein: r.protein_g, cost: r.cost_inr, entries: r.entries }));
}

export function loadMeasurements(): Promise<Measurement[]> {
  return db.select().from(measurements).orderBy(asc(measurements.date), asc(measurements.id));
}

/** Dates with a logged workout (≥1 set or incline walk), one entry per session. */
export async function loadLoggedSessionDates(from: string, to: string): Promise<string[]> {
  const res = await db.execute<{ date: string }>(sql`
    select s.date::text as date from sessions s
    where s.date between ${from} and ${to}
      and (s.incline_walk or exists (select 1 from sets st where st.session_id = s.id))
    order by s.date`);
  return res.rows.map((r) => r.date);
}

/* ------------------------------- weekly rate ------------------------------- */

export type WeeklyRate = {
  kgPerWeek: number;
  pctPerWeek: number;
  /** Losing faster than 0.5 %/week — muscle-loss risk in a recomp. */
  tooFast: boolean;
  latest: { date: string; avg7: number };
  baseline: { date: string; avg7: number };
};

/** Compare the latest 7-day average with the one ~7 days earlier (within `days` of history). */
export function weeklyRateFrom(series: WeightPoint[], days = 14): WeeklyRate | null {
  if (series.length < 2) return null;
  const latest = series[series.length - 1];
  const cutoff = addDays(latest.date, -days);
  const target = addDays(latest.date, -7);
  const candidates = series.filter((p) => p.date >= cutoff && p.date < latest.date);
  if (candidates.length === 0) return null;
  const baseline = candidates.reduce((best, p) =>
    Math.abs(daysBetween(p.date, target)) < Math.abs(daysBetween(best.date, target)) ? p : best,
  );
  const span = daysBetween(baseline.date, latest.date);
  if (span < 5) return null;
  const kgPerWeek = ((latest.avg7 - baseline.avg7) / span) * 7;
  const pctPerWeek = (kgPerWeek / baseline.avg7) * 100;
  return {
    kgPerWeek: round(kgPerWeek, 2),
    pctPerWeek: round(pctPerWeek, 2),
    tooFast: kgPerWeek < 0 && Math.abs(pctPerWeek) > 0.5,
    latest: { date: latest.date, avg7: latest.avg7 },
    baseline: { date: baseline.date, avg7: baseline.avg7 },
  };
}

export async function weeklyRate(days = 14): Promise<WeeklyRate | null> {
  return weeklyRateFrom(await loadWeightSeries(), days);
}

/* -------------------------------- adherence -------------------------------- */

export type WeekAdherence = {
  weekStart: string;
  weekEnd: string;
  isCurrent: boolean;
  daysLogged: number;
  avgKcal: number | null;
  avgProtein: number | null;
  /** % of logged days inside the kcal range. null when nothing logged. */
  kcalAdherencePct: number | null;
  /** % of logged days at or above the phase protein minimum. */
  proteinHitPct: number | null;
  sessionsDone: number;
  sessionsPlanned: number;
};

export const SESSIONS_PER_WEEK = 4;

/** ISO-week Monday for a date. */
export function mondayOf(iso: string): string {
  return addDays(iso, -(isoWeekday(iso) - 1));
}

export function adherenceByWeekFrom(input: {
  settings: Settings;
  totals: DailyTotal[];
  sessionDates: string[];
  weeks?: number;
  today?: string;
}): WeekAdherence[] {
  const { settings, totals, sessionDates, weeks = 12, today = todayIST() } = input;
  const totalsByDate = new Map(totals.map((t) => [t.date, t]));
  const currentMonday = mondayOf(today);
  const out: WeekAdherence[] = [];

  for (let w = 0; w < weeks; w++) {
    const weekStart = addDays(currentMonday, -7 * w);
    const weekEnd = addDays(weekStart, 6);
    let logged = 0, kcalSum = 0, protSum = 0, kcalIn = 0, protHit = 0;
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      if (date > today) break;
      const t = totalsByDate.get(date);
      if (!t || t.entries === 0) continue;
      const tg = getTargets(date, settings);
      logged++;
      kcalSum += t.kcal;
      protSum += t.protein;
      if (t.kcal >= tg.kcalRange[0] && t.kcal <= tg.kcalRange[1]) kcalIn++;
      if (t.protein >= tg.proteinMin) protHit++;
    }
    const sessionsDone = sessionDates.filter((d) => d >= weekStart && d <= weekEnd).length;
    out.push({
      weekStart,
      weekEnd,
      isCurrent: w === 0,
      daysLogged: logged,
      avgKcal: logged ? Math.round(kcalSum / logged) : null,
      avgProtein: logged ? round(protSum / logged, 1) : null,
      kcalAdherencePct: logged ? Math.round((kcalIn / logged) * 100) : null,
      proteinHitPct: logged ? Math.round((protHit / logged) * 100) : null,
      sessionsDone,
      sessionsPlanned: SESSIONS_PER_WEEK,
    });
  }
  return out; // newest first
}

export async function adherenceByWeek(weeks = 12): Promise<WeekAdherence[]> {
  const today = todayIST();
  const from = addDays(mondayOf(today), -7 * (weeks - 1));
  const [settings, totals, sessionDates] = await Promise.all([getSettings(), loadDailyTotals(from, today), loadLoggedSessionDates(from, today)]);
  return adherenceByWeekFrom({ settings, totals, sessionDates, weeks, today });
}

/* --------------------------------- verdict --------------------------------- */

export type Verdict = "not_enough_data" | "hold" | "eat_more" | "eat_less" | "tighten_logging";
export type WeeklyVerdict = { verdict: Verdict; reasons: string[] };

export const VERDICT_LABEL: Record<Verdict, string> = {
  not_enough_data: "Not enough data yet",
  hold: "Hold steady",
  eat_more: "Eat slightly more",
  eat_less: "Eat slightly less",
  tighten_logging: "Tighten up logging",
};

/** Closest series point at or before `target` (within `tolerance` days). */
function pointAtOrBefore(series: WeightPoint[], target: string, tolerance = 3): WeightPoint | null {
  let best: WeightPoint | null = null;
  for (const p of series) {
    if (p.date > target) break;
    best = p;
  }
  return best && daysBetween(best.date, target) <= tolerance ? best : null;
}

export function weeklyVerdictFrom(input: {
  series: WeightPoint[];
  measurements: Measurement[];
  /** Totals covering at least the last 7 days. */
  totals: DailyTotal[];
  today?: string;
}): WeeklyVerdict {
  const { series, measurements: ms, totals, today = todayIST() } = input;
  const reasons: string[] = [];

  if (series.length < 7) {
    return { verdict: "not_enough_data", reasons: [`${series.length} of 7 weigh-ins needed for a trend.`] };
  }

  const weekAgo = addDays(today, -6);
  const loggedDays = totals.filter((t) => t.date >= weekAgo && t.date <= today && t.entries > 0).length;
  if (loggedDays < 5) {
    return { verdict: "tighten_logging", reasons: [`Only ${loggedDays} of the last 7 days have food logged — the numbers below can't be trusted yet.`] };
  }
  reasons.push(`${loggedDays}/7 days logged.`);

  const rate = weeklyRateFrom(series);
  if (rate) {
    const dir = rate.kgPerWeek < 0 ? "down" : rate.kgPerWeek > 0 ? "up" : "flat";
    reasons.push(`7-day average ${dir} ${Math.abs(rate.kgPerWeek).toFixed(2)} kg/week (${Math.abs(rate.pctPerWeek).toFixed(2)} %).`);
    if (rate.tooFast) {
      reasons.push("Faster than 0.5 %/week risks losing muscle in a recomp.");
      return { verdict: "eat_more", reasons };
    }
  }

  const latest = series[series.length - 1];
  const threeWeeksAgo = pointAtOrBefore(series, addDays(latest.date, -21));
  if (threeWeeksAgo) {
    const delta = latest.avg7 - threeWeeksAgo.avg7;
    if (Math.abs(delta) <= 0.2) {
      reasons.push(`Weight flat for 3 weeks (${delta >= 0 ? "+" : ""}${delta.toFixed(1)} kg).`);
      const navels = ms.filter((m) => m.navelCm !== null);
      const latestNavel = navels[navels.length - 1];
      const older = latestNavel ? [...navels].reverse().find((m) => daysBetween(m.date, latestNavel.date) >= 21) : undefined;
      if (latestNavel && older) {
        if (latestNavel.navelCm! >= older.navelCm!) {
          reasons.push(`Navel not down (${older.navelCm} → ${latestNavel.navelCm} cm).`);
          return { verdict: "eat_less", reasons };
        }
        reasons.push(`Navel still dropping (${older.navelCm} → ${latestNavel.navelCm} cm) — recomp is working.`);
      } else {
        reasons.push("Log navel weekly to tell a stall from a recomp.");
      }
    }
  }

  return { verdict: "hold", reasons };
}

export async function weeklyVerdict(): Promise<WeeklyVerdict> {
  const today = todayIST();
  const [series, ms, totals] = await Promise.all([loadWeightSeries(), loadMeasurements(), loadDailyTotals(addDays(today, -6), today)]);
  return weeklyVerdictFrom({ series, measurements: ms, totals, today });
}

/* ------------------------------- maintenance ------------------------------- */

export type Maintenance = {
  /** Estimated maintenance, kcal/day. */
  tdee: number;
  avgIntake: number;
  weightChangeKg: number;
  window: { from: string; to: string; days: number; daysWithBoth: number };
  /** tdee − 225 (mild deficit). Suggestion only — never auto-applied. */
  suggestedTarget: number;
};

export const MAINTENANCE_MIN_DAYS = 21;
export const MAINTENANCE_WINDOW_DAYS = 28;
export const DEFICIT_KCAL = 225;

/**
 * avg intake + (Δ 7-day-avg weight × 7700 / days). Needs ≥21 days in the last 28
 * that have both a weigh-in and logged intake.
 */
export function estimateMaintenanceFrom(input: { series: WeightPoint[]; totals: DailyTotal[]; today?: string }): Maintenance | null {
  const { series, totals, today = todayIST() } = input;
  const from = addDays(today, -(MAINTENANCE_WINDOW_DAYS - 1));
  const w = series.filter((p) => p.date >= from && p.date <= today);
  const intake = totals.filter((t) => t.date >= from && t.date <= today && t.entries > 0);
  const intakeDates = new Set(intake.map((t) => t.date));
  const daysWithBoth = w.filter((p) => intakeDates.has(p.date)).length;
  if (daysWithBoth < MAINTENANCE_MIN_DAYS) return null;

  const first = w[0];
  const last = w[w.length - 1];
  const days = daysBetween(first.date, last.date);
  if (days < 14) return null;
  const avgIntake = intake.reduce((s, t) => s + t.kcal, 0) / intake.length;
  const weightChangeKg = last.avg7 - first.avg7;
  const tdee = Math.round(avgIntake + (weightChangeKg * 7700) / days);
  return {
    tdee,
    avgIntake: Math.round(avgIntake),
    weightChangeKg: round(weightChangeKg, 2),
    window: { from: first.date, to: last.date, days, daysWithBoth },
    suggestedTarget: Math.round((tdee - DEFICIT_KCAL) / 5) * 5,
  };
}

export async function estimateMaintenance(): Promise<Maintenance | null> {
  const today = todayIST();
  const from = addDays(today, -(MAINTENANCE_WINDOW_DAYS - 1));
  const [series, totals] = await Promise.all([loadWeightSeries(), loadDailyTotals(from, today)]);
  return estimateMaintenanceFrom({ series, totals, today });
}

/* ----------------------------------- util ---------------------------------- */

function round(n: number, dp: number): number {
  return Math.round(n * 10 ** dp) / 10 ** dp;
}
