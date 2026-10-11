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

export function Totals({ state }: { state: DayState }) {
  const { totals, targets } = state;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <Bar label="Calories" value={totals.kcal} target={targets.kcal} unit="kcal" over={totals.kcal > targets.kcalRange[1]} />
      <Bar label="Protein" value={totals.protein} target={targets.proteinMin} unit="g" over={false} />
      <p className="text-xs text-muted">
        ₹{totals.cost.toFixed(0)} today · {totals.entries} {totals.entries === 1 ? "entry" : "entries"}
      </p>
    </section>
  );
}
