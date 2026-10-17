import { n0 } from "@/lib/format";
import type { DayState } from "@/lib/rules/dayState";

function Bar({ label, value, target, unit, over }: { label: string; value: number; target: number; unit: string; over: boolean }) {
  const pct = Math.min(100, (value / target) * 100);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted">
          <span className={over ? "font-medium text-danger" : "font-medium text-fg"}>{Math.round(value)}</span> / {target} {unit}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full transition-[width] ${over ? "bg-danger" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** One line under the bars: what's left, steps on rest/unset days, smoke-free streak. */
function statusLine({ remaining, totals, targets, dayPlan, metrics, smokeFreeDays }: DayState): string {
  const parts = [
    remaining.kcal >= 0 ? `${n0(remaining.kcal)} kcal left` : `${n0(-remaining.kcal)} kcal over`,
    remaining.protein > 0 ? `${n0(remaining.protein)} g protein to go` : `protein ✓ ${n0(totals.protein)} g`,
  ];
  // The workout itself is on the day picker line; steps matter on rest and unset days.
  if (dayPlan.kind === "rest" || dayPlan.kind === "unset") {
    const steps = metrics.steps ?? 0;
    parts.push(`${n0(steps)} / ${n0(targets.steps)} steps${steps >= targets.steps ? " ✓" : ""}`);
  }
  if (smokeFreeDays !== null) parts.push(`${smokeFreeDays} d smoke-free`);
  return parts.join(" · ");
}

export function Totals({ state }: { state: DayState }) {
  const { totals, targets } = state;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <Bar label="Calories" value={totals.kcal} target={targets.kcal} unit="kcal" over={totals.kcal > targets.kcalRange[1]} />
      <Bar label="Protein" value={totals.protein} target={targets.proteinMin} unit="g" over={false} />
      <p className="text-sm text-muted">{statusLine(state)}</p>
    </section>
  );
}
