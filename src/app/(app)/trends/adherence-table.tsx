import { shortDate } from "@/components/charts/line-chart";
import type { WeekAdherence } from "@/lib/metrics/trends";
import { Section } from "./section";

function Pct({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted">—</span>;
  const tone = v >= 80 ? "text-accent" : v >= 50 ? "text-warn" : "text-danger";
  return <span className={`font-medium tabular-nums ${tone}`}>{v}%</span>;
}

export function AdherenceTable({ weeks }: { weeks: WeekAdherence[] }) {
  return (
    <Section title="Weekly adherence">
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] font-medium text-muted">
          <tr>
            <th className="pb-2 font-medium">Week</th>
            <th className="pb-2 text-right font-medium">Logged</th>
            <th className="pb-2 text-right font-medium">kcal</th>
            <th className="pb-2 text-right font-medium">Protein</th>
            <th className="pb-2 text-right font-medium">Lifts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {weeks.map((w) => (
            <tr key={w.weekStart} className="h-10">
              <td>
                {shortDate(w.weekStart)}
                {w.isCurrent ? <span className="ml-1 text-[10px] text-muted">now</span> : null}
              </td>
              <td className="text-right tabular-nums">{w.daysLogged}/7</td>
              <td className="text-right"><Pct v={w.kcalAdherencePct} /></td>
              <td className="text-right"><Pct v={w.proteinHitPct} /></td>
              <td className={`text-right tabular-nums ${w.sessionsDone >= w.sessionsPlanned ? "text-accent" : ""}`}>
                {w.sessionsDone}/{w.sessionsPlanned}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">kcal = logged days inside the range · Protein = logged days at or above the phase minimum.</p>
    </Section>
  );
}
