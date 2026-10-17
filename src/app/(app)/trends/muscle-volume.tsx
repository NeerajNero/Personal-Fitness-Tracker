import { shortDate } from "@/components/charts/line-chart";
import { musclesInOrder, type MuscleWeek } from "@/lib/metrics/strength";
import { Section } from "./section";

/** Working sets per muscle group, last weeks oldest → newest. Back first (the V-taper goal). */
export function MuscleVolume({ weeks }: { weeks: MuscleWeek[] }) {
  const cols = [...weeks].reverse();
  const totals: Record<string, number> = {};
  for (const w of weeks) for (const [m, n] of Object.entries(w.sets)) totals[m] = (totals[m] ?? 0) + n;
  const muscles = musclesInOrder(totals).map(([m]) => m);

  return (
    <Section title="Sets per muscle" aside={<span className="text-xs text-muted">working sets / week</span>}>
      {muscles.length === 0 ? (
        <p className="text-sm text-muted">No sets logged in the last {weeks.length} weeks.</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-[11px] text-muted">
              <th className="py-1 text-left font-normal">Week of</th>
              {cols.map((w) => (
                <th key={w.weekStart} className="py-1 text-right font-normal">{shortDate(w.weekStart)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {muscles.map((m) => (
              <tr key={m}>
                <td className={`py-1.5 ${m === "back" ? "font-medium" : ""}`}>{m}</td>
                {cols.map((w) => (
                  <td key={w.weekStart} className="py-1.5 text-right">{w.sets[m] ?? <span className="text-muted">–</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}
