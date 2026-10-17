/** Bot operations. Each returns the HTML reply. All DB writes go through the same shared functions the screens use. */
import type { Food, Settings } from "@/db/schema";
import { incrementWater, upsertDailyMetrics } from "@/lib/daily";
import { addDays, nowTimeIST } from "@/lib/dates";
import { copyFoodLog, deleteLatestFoodEntry, entryFromFood, insertFoodEntries, listFoodLog, listFoods } from "@/lib/food";
import { esc, n0, n1, qtyStr } from "@/lib/format";
import { getDayState } from "@/lib/rules/dayState";
import { upsertMeasurementByDate } from "@/lib/measurements";
import { copyLastSets, getSessionDetail, setDayPlan, type DayChoice } from "@/lib/training";
import { appUrl } from "./env";
import { didButtons, entryLine, runningLine, todaySummary, withOverage } from "./messages";
import type { InlineKeyboardButton } from "grammy/types";
import { matchFood, servingsFor } from "./parse";

export async function opWeight(date: string, kg: number): Promise<string> {
  await upsertDailyMetrics(date, { weightKg: kg });
  return `⚖️ ${n1(kg)} kg saved.`;
}

export async function opSteps(date: string, n: number, settings: Settings): Promise<string> {
  await upsertDailyMetrics(date, { steps: n });
  const state = await getDayState(date, { settings });
  const restish = state.dayPlan.kind === "rest" || state.dayPlan.kind === "unset";
  return `👟 ${n0(n)} steps saved${restish && n >= state.targets.steps ? " — target hit ✓" : ""}.`;
}

export async function opWater(date: string, settings: Settings): Promise<string> {
  if (!settings.nudgeWater) return "Water tracking is off. Turn it on in Settings → Nudges to count glasses.";
  const n = await incrementWater(date);
  return `💧 ${n} ${n === 1 ? "glass" : "glasses"} today.`;
}

/** Returns null when nothing in the catalogue matches (caller falls through to AI). */
export async function opFood(date: string, query: string, n: number | null, settings: Settings, foods?: Food[]): Promise<string | null> {
  const list = foods ?? (await listFoods());
  const food = matchFood(query, list);
  if (!food) return null;
  const q = servingsFor(food, n);
  if ("error" in q) return q.error;
  await insertFoodEntries([entryFromFood(food, q.qty, date, "telegram")]);
  const state = await getDayState(date, { settings });
  const line = entryLine(food.name, q.qty, food.servingLabel, food.kcal * q.qty, food.proteinG * q.qty);
  return withOverage(`${line}\n${runningLine(state)}`, state);
}

/** `dosa 350 12` — a one-off entry with numbers estimated elsewhere. */
export async function opManual(date: string, label: string, kcal: number, proteinG: number, settings: Settings): Promise<string> {
  await insertFoodEntries([{ date, time: nowTimeIST(), foodId: null, label, qty: 1, kcal, proteinG, costInr: 0, source: "telegram" }]);
  const state = await getDayState(date, { settings });
  return withOverage(`${entryLine(label, 1, null, kcal, proteinG)}\n${runningLine(state)}`, state);
}

/** `copy` — log everything from yesterday again. Only on an empty day so a repeat can't double it. */
export async function opCopy(date: string, settings: Settings): Promise<string> {
  if ((await listFoodLog(date)).length > 0) return "Today already has food logged — <code>undo</code> entries first if you want a clean copy.";
  const n = await copyFoodLog(addDays(date, -1), date, "telegram");
  if (n === 0) return "Nothing was logged yesterday.";
  const state = await getDayState(date, { settings });
  return withOverage(`↺ Copied ${n} ${n === 1 ? "entry" : "entries"} from yesterday.\n${runningLine(state)}`, state);
}

/** A reply with optional inline buttons. */
export type Reply = { text: string; keyboard?: InlineKeyboardButton[][] };

const trainLink = (date: string, label = "open Train") => `<a href="${appUrl()}/train?d=${date}">${label}</a>`;
const confirmInApp = (date: string, setCount: number) =>
  `That day already has ${setCount} ${setCount === 1 ? "set" : "sets"} logged — ${trainLink(date, "change it in the app")} so nothing is lost.`;

/** `push` / `rest` (or a morning button) — set what the day is. A type replies with its list and a ✓ All same button. */
export async function opPlan(date: string, choice: DayChoice, settings: Settings): Promise<Reply> {
  const r = await setDayPlan(date, choice);
  if (!r.ok) return { text: confirmInApp(date, r.setCount) };
  if (choice.kind === "rest") {
    const state = await getDayState(date, { settings });
    return { text: `🛌 Rest day set. Steps target ${n0(state.targets.stepsRange[0])}–${n0(state.targets.stepsRange[1])}.` };
  }
  const detail = r.sessionId ? await getSessionDetail(r.sessionId) : null;
  const title = detail?.typeName ?? "Custom workout";
  const lines = detail?.exercises.map((e) => `• ${esc(e.name)} — ${esc(e.sets.length ? "logged ✓" : e.hint.text)}`) ?? [];
  return {
    text: [`🏋️ <b>${esc(title)}</b>`, ...lines, `Edit a lift that progressed: ${trainLink(date)}`].join("\n"),
    keyboard: lines.length ? [[{ text: "✓ All same as last time", callback_data: `did:${date}:same` }]] : undefined,
  };
}

async function logSame(date: string, sessionId: number, title: string, wasLogged: boolean): Promise<Reply> {
  const filled = await copyLastSets(sessionId);
  const link = trainLink(date);
  if (filled === 0) {
    return { text: wasLogged ? `${esc(title)} already logged ✓ — ${link} to change anything.` : `🏋️ ${esc(title)} — no previous sets to copy, ${link} to enter them.` };
  }
  return { text: `🏋️ ${esc(title)} logged — same as last time (${filled} ${filled === 1 ? "exercise" : "exercises"}). Progressed on a lift? ${link} and edit it.` };
}

/** `done` — log the chosen type as same as last time; when the day isn't set (or is rest), ask which. */
export async function opDone(date: string, settings: Settings): Promise<Reply> {
  const state = await getDayState(date, { settings });
  const plan = state.dayPlan;
  if ((plan.kind === "workout" || plan.kind === "custom") && state.flags.sessionId) {
    return logSame(date, state.flags.sessionId, plan.typeName ?? "Custom workout", state.flags.workoutLogged);
  }
  if (state.daysSince.length === 0) return { text: `No workout types yet — add them in Settings, or ${trainLink(date)}.` };
  return { text: plan.kind === "rest" ? "Today is set as rest. Did you train after all?" : "What did you do today?", keyboard: didButtons({ ...state, dayPlan: { kind: "unset", typeId: null, typeName: null } }) };
}

/** Evening buttons: `did:<date>:<typeId|rest|same>` — set the day and log it as same as last time. */
export async function opDid(date: string, value: string, settings: Settings): Promise<Reply> {
  if (value === "rest") return opPlan(date, { kind: "rest" }, settings);
  if (value === "same") {
    const state = await getDayState(date, { settings });
    if (!state.flags.sessionId) return opDone(date, settings);
    return logSame(date, state.flags.sessionId, state.dayPlan.typeName ?? "Custom workout", state.flags.workoutLogged);
  }
  const r = await setDayPlan(date, { kind: "workout", typeId: Number(value) });
  if (!r.ok) return { text: confirmInApp(date, r.setCount) };
  const detail = r.sessionId ? await getSessionDetail(r.sessionId) : null;
  return logSame(date, r.sessionId!, detail?.typeName ?? "Workout", false);
}

export async function opToday(date: string, settings: Settings): Promise<string> {
  return todaySummary(await getDayState(date, { settings }));
}

export async function opUndo(date: string, settings: Settings): Promise<string> {
  const row = await deleteLatestFoodEntry(date);
  if (!row) return "Nothing to undo today.";
  const state = await getDayState(date, { settings });
  return `↩️ Removed <b>${esc(row.label)}</b>${row.qty !== 1 ? ` ×${qtyStr(row.qty)}` : ""} (${n0(row.kcal)} kcal).\n${runningLine(state)}`;
}

export async function opMeasure(date: string, kind: "navel" | "waist", cm: number): Promise<string> {
  await upsertMeasurementByDate(date, kind === "navel" ? { navelCm: cm } : { waistCm: cm });
  return `📏 ${kind} ${n1(cm)} cm saved for today.`;
}
