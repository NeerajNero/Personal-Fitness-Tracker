import { ROUTINE_LABEL } from "@/lib/routine";
import type { DayState } from "@/lib/rules/dayState";

type Tone = "neutral" | "good" | "bad";

const tone: Record<Tone, string> = {
  neutral: "border-border bg-surface text-fg",
  good: "border-accent/40 bg-accent/10 text-accent",
  bad: "border-danger/40 bg-danger/10 text-danger",
};

const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");

export function Chips({ state }: { state: DayState }) {
  const { remaining, totals, targets, flags, metrics } = state;
  const chips: { text: string; tone: Tone }[] = [];

  chips.push(
    remaining.kcal >= 0
      ? { text: `${fmt(remaining.kcal)} kcal left`, tone: "neutral" }
      : { text: `${fmt(-remaining.kcal)} kcal over`, tone: "bad" },
  );

  chips.push(
    remaining.protein > 0
      ? { text: `${fmt(remaining.protein)} g protein to go`, tone: "neutral" }
      : { text: `protein ✓ ${fmt(totals.protein)} g`, tone: "good" },
  );

  if (flags.isTrainingDay && flags.routineDayName) {
    chips.push({
      text: `${ROUTINE_LABEL[flags.routineDayName]} today${flags.workoutLogged ? " ✓" : ""}`,
      tone: flags.workoutLogged ? "good" : "neutral",
    });
  } else {
    const steps = metrics.steps ?? 0;
    chips.push({
      text: `${fmt(steps)} / ${fmt(targets.steps)} steps`,
      tone: steps >= targets.steps ? "good" : "neutral",
    });
  }

  if (state.smokeFreeDays !== null) {
    chips.push({ text: `${state.smokeFreeDays} d smoke-free`, tone: "good" });
  }

  return (
    <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
      {chips.map((c) => (
        <li
          key={c.text}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap ${tone[c.tone]}`}
        >
          {c.text}
        </li>
      ))}
    </ul>
  );
}
