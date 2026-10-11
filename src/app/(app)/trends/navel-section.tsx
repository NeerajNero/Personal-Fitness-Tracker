import type { Measurement, Settings } from "@/db/schema";
import { dateTicks, dayNum, LineChart } from "@/components/charts/line-chart";
import { todayIST } from "@/lib/dates";
import { Section } from "./section";

export function NavelSection({ measurements, settings, today }: { measurements: Measurement[]; settings: Settings; today: string }) {
  const navels = measurements.filter((m) => m.navelCm !== null) as (Measurement & { navelCm: number })[];
  const first = navels[0];
  const startDate = first?.date ?? (settings.onboardedAt ? todayIST(settings.onboardedAt) : settings.smokeFreeSince ?? today);
  const startNavel = first?.navelCm ?? settings.navelStartCm;
  const goalMid = (settings.navelGoalMinCm + settings.navelGoalMaxCm) / 2;

  const x0 = dayNum(startDate);
  const x1 = dayNum(settings.goalDate);
  const xt = Math.min(Math.max(dayNum(today), x0), x1);
  const goalAt = (x: number) => startNavel + ((goalMid - startNavel) * (x - x0)) / (x1 - x0 || 1);
  const goalToday = goalAt(xt);
  const latest = navels[navels.length - 1];
  const gap = latest ? latest.navelCm - goalToday : null;

  const status =
    gap === null ? { text: "No navel measurement yet", tone: "text-muted" }
    : gap <= 0.25 ? { text: "On track", tone: "text-accent" }
    : { text: `Behind by ${gap.toFixed(1)} cm`, tone: "text-danger" };

  return (
    <Section title="Navel vs goal" aside={<span className={`text-sm font-medium ${status.tone}`}>{status.text}</span>}>
      <LineChart
        ariaLabel="Navel circumference against the goal line"
        height={170}
        xDomain={[x0, x1]}
        xTicks={dateTicks(startDate, settings.goalDate, 5)}
        yDomain={[Math.min(settings.navelGoalMinCm, ...navels.map((n) => n.navelCm)) - 2, Math.max(startNavel, ...navels.map((n) => n.navelCm)) + 2]}
        yFormat={(v) => `${Math.round(v)}`}
        markerX={xt}
        band={{
          upper: [{ x: x0, y: startNavel }, { x: x1, y: settings.navelGoalMaxCm }],
          lower: [{ x: x0, y: startNavel }, { x: x1, y: settings.navelGoalMinCm }],
        }}
        series={[
          { id: "goal", points: [{ x: x0, y: startNavel }, { x: x1, y: goalMid }], color: "var(--muted)", dashed: true, strokeWidth: 1.5 },
          { id: "navel", points: navels.map((n) => ({ x: dayNum(n.date), y: n.navelCm })), color: "var(--accent)", dots: true, strokeWidth: 2 },
        ]}
      />
      <p className="mt-2 text-xs text-muted">
        {startNavel} cm → {settings.navelGoalMinCm}–{settings.navelGoalMaxCm} cm by {settings.goalDate}. Goal line today: {goalToday.toFixed(1)} cm
        {latest ? ` · latest ${latest.navelCm} cm` : ""}.
      </p>
    </Section>
  );
}
