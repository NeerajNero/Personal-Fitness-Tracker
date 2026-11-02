import { label } from "@/components/ui";
import { VERDICT_LABEL, type WeeklyVerdict } from "@/lib/metrics/trends";

const tone: Record<WeeklyVerdict["verdict"], string> = {
  not_enough_data: "text-muted",
  hold: "text-done",
  eat_more: "text-danger",
  eat_less: "text-warn",
  tighten_logging: "text-warn",
};

/** The answer first, as a sentence, then the reasons. No box: it's the headline of the screen. */
export function VerdictCard({ verdict }: { verdict: WeeklyVerdict }) {
  return (
    <section>
      <p className={label}>This week</p>
      <h2 className={`mt-1 text-[1.75rem] font-bold leading-tight tracking-tight ${tone[verdict.verdict]}`}>{VERDICT_LABEL[verdict.verdict]}</h2>
      <ul className="mt-2 flex flex-col gap-1 text-sm text-muted">
        {verdict.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </section>
  );
}
