/** Bot operations. Each returns the HTML reply. All DB writes go through the same shared functions the screens use. */
import type { Food, Settings } from "@/db/schema";
import { incrementWater, upsertDailyMetrics } from "@/lib/daily";
import { addDays, nowTimeIST } from "@/lib/dates";
import { copyFoodLog, deleteLatestFoodEntry, entryFromFood, insertFoodEntries, listFoodLog, listFoods } from "@/lib/food";
import { esc, n0, n1, qtyStr } from "@/lib/format";
import { ROUTINE_LABEL } from "@/lib/routine";
import { getDayState } from "@/lib/rules/dayState";
import { upsertMeasurementByDate } from "@/lib/measurements";
import { createSession } from "@/lib/training";
import { appUrl } from "./env";
import { entryLine, runningLine, todaySummary, withOverage } from "./messages";
import { matchFood, servingsFor } from "./parse";

export async function opWeight(date: string, kg: number): Promise<string> {
  await upsertDailyMetrics(date, { weightKg: kg });
  return `⚖️ ${n1(kg)} kg saved.`;
}

export async function opSteps(date: string, n: number, settings: Settings): Promise<string> {
  await upsertDailyMetrics(date, { steps: n });
  const state = await getDayState(date, { settings });
  return `👟 ${n0(n)} steps saved${!state.flags.isTrainingDay && n >= state.targets.steps ? " — target hit ✓" : ""}.`;
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

export async function opDone(date: string, settings: Settings): Promise<string> {
  const state = await getDayState(date, { settings });
  const link = `<a href="${appUrl()}/train">enter sets</a>`;
  if (state.flags.sessionId) return `Already started today — ${link}.`;
  await createSession(date, state.flags.routineDayId);
  const label = state.flags.routineDayName ? ROUTINE_LABEL[state.flags.routineDayName] : "an ad-hoc session";
  return `🏋️ Started ${label} — ${link}.`;
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
