import type { MonthSpend } from "@/lib/metrics/spend";
import { Section } from "./section";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function SpendSection({ spend }: { spend: MonthSpend }) {
  const pct = spend.pctOfBudget;
  const tone = pct >= 100 ? "danger" : pct >= 80 ? "warn" : "accent";
  const bar = { danger: "bg-danger", warn: "bg-warn", accent: "bg-accent" }[tone];
  const text = { danger: "text-danger", warn: "text-warn", accent: "text-fg" }[tone];
  const monthName = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long" }).format(new Date(`${spend.from}T00:00:00Z`));

  return (
    <Section title="Protein spend" aside={<span className="text-xs text-muted">{monthName} · day {spend.dayOfMonth}/{spend.daysInMonth}</span>}>
      <div className="flex items-baseline justify-between text-sm">
        <span className={`text-xl font-semibold tabular-nums ${text}`}>{inr(spend.spent)}</span>
        <span className="text-muted">of {inr(spend.budget)} · {pct}%</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-border">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className={`mt-2 text-xs ${spend.projectedMonthEnd > spend.budget ? "text-danger" : "text-muted"}`}>
        Projected month end {inr(spend.projectedMonthEnd)} at the current rate
        {spend.projectedMonthEnd > spend.budget ? ` — ${inr(spend.projectedMonthEnd - spend.budget)} over budget` : ""}.
      </p>

      {spend.foodsRanked.length ? (
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-[11px] font-medium text-muted">
            <tr>
              <th className="pb-2 font-medium">Food</th>
              <th className="pb-2 text-right font-medium">₹</th>
              <th className="pb-2 text-right font-medium">Protein</th>
              <th className="pb-2 text-right font-medium">₹/g</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {spend.foodsRanked.map((f) => (
              <tr key={`${f.foodId ?? "q"}-${f.label}`} className="h-10">
                <td className="pr-2"><span className="line-clamp-1">{f.label}</span></td>
                <td className="text-right tabular-nums">{Math.round(f.costInr)}</td>
                <td className="text-right tabular-nums text-muted">{Math.round(f.proteinG)} g</td>
                <td className="text-right tabular-nums font-medium">{f.inrPerGProtein === null ? <span className="text-muted">—</span> : f.inrPerGProtein.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-3 text-sm text-muted">No food logged this month yet.</p>
      )}
    </Section>
  );
}
