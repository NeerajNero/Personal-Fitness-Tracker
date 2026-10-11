import type { Measurement, Settings } from "@/db/schema";
import { daysBetween } from "@/lib/dates";
import { Section } from "./section";

export function GoalCard({ settings, measurements, today }: { settings: Settings; measurements: Measurement[]; today: string }) {
  const navels = measurements.filter((m): m is Measurement & { navelCm: number } => m.navelCm !== null);
  const latest = navels[navels.length - 1] ?? null;
  const start = settings.navelStartCm;
  const goalMid = (settings.navelGoalMinCm + settings.navelGoalMaxCm) / 2;
  const required = start - goalMid;
  const achieved = latest ? start - latest.navelCm : 0;
  const pct = required > 0 ? Math.max(0, Math.min(100, Math.round((achieved / required) * 100))) : 0;
  const daysLeft = Math.max(0, daysBetween(today, settings.goalDate));
  const weeksLeft = daysLeft / 7;
  const requiredRate = latest && weeksLeft > 0 ? (latest.navelCm - goalMid) / weeksLeft : null;

  // Actual rate over the last ~8 weeks: latest vs the reading closest to 56 days earlier (≥ 21 days apart).
  let actualRate: number | null = null;
  if (latest) {
    const target = daysBetween("1970-01-01", latest.date) - 56;
    const older = navels
      .filter((m) => daysBetween(m.date, latest.date) >= 21)
      .reduce<(typeof navels)[number] | null>((best, m) => (!best || Math.abs(daysBetween("1970-01-01", m.date) - target) < Math.abs(daysBetween("1970-01-01", best.date) - target) ? m : best), null);
    if (older) actualRate = (latest.navelCm - older.navelCm) / (daysBetween(older.date, latest.date) / 7);
  }
  const fmtRate = (r: number) => `${r <= 0 ? "" : "+"}${r.toFixed(2)} cm/week`;

  return (
    <Section title="Goal · Oct 2027" aside={<span className="text-sm font-medium text-muted">{Math.floor(weeksLeft)} weeks left</span>}>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-xl font-semibold tabular-nums">{pct}%</span>
        <span className="text-muted">
          {start} → {latest ? latest.navelCm : "?"} → {settings.navelGoalMinCm}–{settings.navelGoalMaxCm} cm
        </span>
      </div>
      <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">{achieved > 0 ? achieved.toFixed(1) : 0} of {required.toFixed(1)} cm lost.</p>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[11px] text-muted">Required from here</dt>
          <dd className="font-medium tabular-nums">{requiredRate === null ? "—" : requiredRate <= 0 ? "Goal reached" : `−${requiredRate.toFixed(2)} cm/week`}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">Actual, last 8 weeks</dt>
          <dd className={`font-medium tabular-nums ${actualRate === null ? "text-muted" : requiredRate !== null && actualRate <= -requiredRate ? "text-accent" : "text-warn"}`}>
            {actualRate === null ? "not enough data" : fmtRate(actualRate)}
          </dd>
        </div>
      </dl>
    </Section>
  );
}
