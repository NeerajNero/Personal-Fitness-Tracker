import type { CheckpointSummary } from "@/lib/metrics/checkpoint";
import { shortDate } from "@/components/charts/line-chart";
import { Section } from "./section";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
      {sub ? <p className="text-[11px] text-muted">{sub}</p> : null}
    </div>
  );
}

const signed = (n: number, unit: string) => `${n > 0 ? "+" : ""}${n} ${unit}`;

export function CheckpointCard({ summary, checkpointDate, daysToGo }: { summary: CheckpointSummary; checkpointDate: string; daysToGo: number }) {
  const frozen = daysToGo < 0;
  return (
    <Section
      title={frozen ? "8-week review" : "Dec 10 checkpoint"}
      aside={<span className="text-sm font-medium text-muted">{frozen ? `Reviewed ${shortDate(checkpointDate)}` : daysToGo === 0 ? "Today" : `${daysToGo} days to go`}</span>}
    >
      <p className="mb-3 text-xs text-muted">
        {shortDate(summary.from)} → {shortDate(summary.to)} · {summary.days} {summary.days === 1 ? "day" : "days"}. Gym-renewal decision — numbers only, the call is yours.
      </p>
      <div className="grid grid-cols-3 gap-x-3 gap-y-4">
        <Stat label="Navel" value={summary.navel ? signed(summary.navel.delta, "cm") : "—"} sub={summary.navel ? `${summary.navel.first} → ${summary.navel.latest}` : "no measurements"} />
        <Stat label="Weight (7d avg)" value={summary.weight ? signed(summary.weight.delta, "kg") : "—"} sub={summary.weight ? `${summary.weight.first} → ${summary.weight.latest}` : "no weigh-ins"} />
        <Stat label="Lifts progressed" value={summary.lifts.tracked ? `${summary.lifts.progressed}/${summary.lifts.tracked}` : "—"} sub="≥3 sessions each" />
        <Stat label="Sessions" value={`${summary.sessionsDone}/${summary.sessionsPlanned}`} sub="done / planned" />
        <Stat label="kcal in range" value={summary.kcalAdherencePct === null ? "—" : `${summary.kcalAdherencePct}%`} sub={`${summary.daysLogged} days logged`} />
        <Stat label="Protein hit" value={summary.proteinHitPct === null ? "—" : `${summary.proteinHitPct}%`} sub={summary.avgProtein !== null ? `avg ${summary.avgProtein} g` : undefined} />
      </div>
    </Section>
  );
}
