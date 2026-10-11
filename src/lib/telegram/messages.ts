/** Telegram message templates (HTML parse mode). */
import { formatDayLabel } from "@/lib/dates";
import { esc, n0, n1, qtyStr } from "@/lib/format";
import { ROUTINE_LABEL } from "@/lib/routine";
import type { DayState } from "@/lib/rules/dayState";
import { overageLine } from "@/lib/rules/instant";

export const HELP = [
  "<b>Recomp bot</b>",
  "<code>w 74.2</code> — weight",
  "<code>s 8500</code> — steps",
  "<code>paneer 150</code> · <code>roti 3</code> · <code>scoop</code> — log food (no number = 1 serving, under 10 = servings, 10+ = grams)",
  "<code>navel 88.5</code> · <code>waist 85</code> — weekly measurement",
  "<code>water</code> — +1 glass",
  "<code>done</code> — start today's workout",
  "<code>today</code> — where you stand",
  "<code>undo</code> — remove the last food entry",
  "Anything else — I'll try to parse it as a meal and ask you to confirm.",
].join("\n");

export function entryLine(label: string, qty: number, servingLabel: string | null, kcal: number, proteinG: number): string {
  const q = servingLabel ? `${qtyStr(qty)} × ${esc(servingLabel)}` : qty === 1 ? "" : `×${qtyStr(qty)}`;
  return `• <b>${esc(label)}</b>${q ? ` ${q}` : ""} — ${n0(kcal)} kcal · ${n1(proteinG)} g`;
}

export function runningLine(state: DayState): string {
  const { totals, targets, remaining } = state;
  const kcal = remaining.kcal >= 0 ? `${n0(remaining.kcal)} left` : `${n0(-remaining.kcal)} over`;
  const prot = remaining.protein > 0 ? `${n0(remaining.protein)} g to go` : "✓";
  return `Today: ${n0(totals.kcal)} / ${n0(targets.kcal)} kcal (${kcal}) · ${n0(totals.protein)} / ${targets.proteinMin} g protein (${prot})`;
}

export function withOverage(text: string, state: DayState): string {
  const o = overageLine(state);
  return o ? `${text}\n${o}` : text;
}

export function todaySummary(state: DayState): string {
  const { totals, targets, remaining, metrics, flags } = state;
  const lines = [`<b>${formatDayLabel(state.date)}</b>`];
  lines.push(`🍽 ${n0(totals.kcal)} / ${n0(targets.kcal)} kcal · ${remaining.kcal >= 0 ? `${n0(remaining.kcal)} left` : `<b>${n0(-remaining.kcal)} over</b>`}`);
  lines.push(`🥚 ${n0(totals.protein)} / ${targets.proteinMin}–${targets.proteinMax} g protein · ${remaining.protein > 0 ? `${n0(remaining.protein)} g to go` : "done ✓"}`);
  if (flags.isTrainingDay && flags.routineDayName) {
    lines.push(`🏋️ ${ROUTINE_LABEL[flags.routineDayName]} — ${flags.workoutLogged ? "logged ✓" : flags.trainingSkipped ? "skipped today" : flags.sessionId ? "started, no sets yet" : "not started"}`);
  } else {
    lines.push(`👟 ${metrics.steps === null ? "no steps yet" : `${n0(metrics.steps)} steps`} · target ${n0(targets.steps)}`);
  }
  lines.push(metrics.weightKg === null ? "⚖️ no weigh-in yet — <code>w 74.2</code>" : `⚖️ ${n1(metrics.weightKg)} kg`);
  if (state.smokeFreeDays !== null) lines.push(`🚭 ${state.smokeFreeDays} days smoke-free`);
  return lines.join("\n");
}
