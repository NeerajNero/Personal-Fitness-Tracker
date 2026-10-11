import { VERDICT_LABEL, type WeeklyVerdict } from "@/lib/metrics/trends";

const tone: Record<WeeklyVerdict["verdict"], string> = {
  not_enough_data: "border-border",
  hold: "border-accent/50",
  eat_more: "border-danger/50",
  eat_less: "border-warn/50",
  tighten_logging: "border-warn/50",
};

export function VerdictCard({ verdict }: { verdict: WeeklyVerdict }) {
  return (
    <section className={`rounded-2xl border-2 bg-surface p-4 ${tone[verdict.verdict]}`}>
      <p className="text-xs font-medium text-muted">This week&apos;s verdict</p>
      <h2 className="text-2xl font-semibold">{VERDICT_LABEL[verdict.verdict]}</h2>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
        {verdict.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </section>
  );
}
