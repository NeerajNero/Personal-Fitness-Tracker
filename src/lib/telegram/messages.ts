/** Telegram message templates (HTML parse mode). */
import { formatDayLabel } from "@/lib/dates";
import { esc, n0, n1, qtyStr } from "@/lib/format";
import type { InlineKeyboardButton } from "grammy/types";
import type { DayState } from "@/lib/rules/dayState";
import { overageLine } from "@/lib/rules/instant";

export const HELP = [
  "<b>Recomp bot</b>",
  "<code>w 74.2</code> — weight",
  "<code>s 8500</code> — steps",
  "<code>dosa 350 12</code> — meal with your own numbers (name kcal protein)",
  "<code>copy</code> — log the same food as yesterday",
  "<code>paneer 150</code> · <code>roti 3</code> · <code>scoop</code> — food or saved meal by name (no number = 1 serving, under 10 = servings, 10+ = grams)",
  "<code>navel 88.5</code> · <code>waist 85</code> — weekly measurement",
  "<code>water</code> — +1 glass",
  "<code>push</code> · <code>pull</code> · <code>rest</code> — set today (any workout type name)",
  "<code>done</code> — log today's workout, same as last time",
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
  const plan = state.dayPlan;
  const status = flags.workoutLogged ? "logged ✓" : flags.sessionId ? "no sets yet" : "not started";
  if (plan.kind === "workout") lines.push(`🏋️ ${esc(plan.typeName ?? "Workout")} — ${status}`);
  else if (plan.kind === "custom") lines.push(`🏋️ Custom workout — ${status}`);
  else if (plan.kind === "rest") lines.push("🛌 Rest day");
  else lines.push(`❔ Day not set${state.nextUp ? ` — next up ${esc(state.nextUp.typeName)}` : ""}. Send a type name or <code>rest</code>.`);
  if (plan.kind === "rest" || plan.kind === "unset") {
    lines.push(`👟 ${metrics.steps === null ? "no steps yet" : `${n0(metrics.steps)} steps`} · target ${n0(targets.steps)}`);
  }
  lines.push(metrics.weightKg === null ? "⚖️ no weigh-in yet — <code>w 74.2</code>" : `⚖️ ${n1(metrics.weightKg)} kg`);
  if (state.smokeFreeDays !== null) lines.push(`🚭 ${state.smokeFreeDays} days smoke-free`);
  return lines.join("\n");
}

/* ------------------------------ day buttons ------------------------------ */
/* Callback data: `plan:<date>:<typeId|rest>` sets the day (morning); `did:<date>:<typeId|rest|same>` logs it (evening). */

type Keyboard = InlineKeyboardButton[][];

function rows(buttons: InlineKeyboardButton[], perRow = 3): Keyboard {
  const out: Keyboard = [];
  for (let i = 0; i < buttons.length; i += perRow) out.push(buttons.slice(i, i + perRow));
  return out;
}

/** Morning: one button per active type (▶ = next up, with days since) plus Rest. */
export function planButtons(state: DayState): Keyboard {
  const types = state.daysSince.map((t) => ({
    text: `${state.nextUp?.typeId === t.typeId ? "▶ " : ""}${t.typeName}${t.days !== null ? ` · ${t.days}d` : ""}`,
    callback_data: `plan:${state.date}:${t.typeId}`,
  }));
  return [...rows(types), [{ text: "🛌 Rest", callback_data: `plan:${state.date}:rest` }]];
}

/** Evening: a chosen type with nothing logged → "✓ Did <type>"; otherwise one button per type. Rest either way. */
export function didButtons(state: DayState): Keyboard {
  const rest = { text: "🛌 Rest", callback_data: `did:${state.date}:rest` };
  if (state.dayPlan.kind === "workout") return [[{ text: `✓ Did ${state.dayPlan.typeName ?? "it"}`, callback_data: `did:${state.date}:same` }, rest]];
  const types = state.daysSince.map((t) => ({ text: t.typeName, callback_data: `did:${state.date}:${t.typeId}` }));
  return [...rows(types), [rest]];
}
