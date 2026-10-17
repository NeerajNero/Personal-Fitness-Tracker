"use server";

import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { exercises, foods, routineDays, routineExercises, settings } from "@/db/schema";
import { bodyStatsSchema } from "@/lib/body-stats";
import { todayIST } from "@/lib/dates";
import { listFoods } from "@/lib/food";
import { BOT_COMMAND_WORDS, MUSCLE_GROUPS } from "@/lib/routine";
import { matchFood } from "@/lib/telegram/parse";
import { findOrCreateExercise, listWorkoutTypes } from "@/lib/training";
import { fail, type ActionResult } from "@/lib/action-result";
import { requireSession } from "@/lib/session";

import { NUDGE_TOGGLES, type NudgeToggle } from "@/lib/nudges";

const toggleSchema = z.enum(NUDGE_TOGGLES);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export async function setNudgeToggle(key: NudgeToggle, value: boolean): Promise<ActionResult> {
  await requireSession();
  try {
    const k = toggleSchema.parse(key);
    await db.update(settings).set({ [k]: z.boolean().parse(value), updatedAt: new Date() }).where(eq(settings.id, 1));
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveQuietHours(start: string, end: string): Promise<ActionResult> {
  await requireSession();
  try {
    const s = hhmm.parse(start);
    const e = hhmm.parse(end);
    await db.update(settings).set({ quietHoursStart: s, quietHoursEnd: e, updatedAt: new Date() }).where(eq(settings.id, 1));
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function saveDailyCap(cap: number): Promise<ActionResult> {
  await requireSession();
  try {
    const c = z.coerce.number().int("Whole number").min(1, "1–20").max(20, "1–20").parse(cap);
    await db.update(settings).set({ nudgeDailyCap: c, updatedAt: new Date() }).where(eq(settings.id, 1));
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ============================== targets & phase ============================== */

function revalidateAll() {
  for (const p of ["/settings", "/today", "/train", "/trends", "/onboarding/confirm"]) revalidatePath(p);
}

export type FormState = { ok: boolean; error?: string; fieldErrors?: Record<string, string> } | null;

const int = (min: number, max: number, msg: string) => z.coerce.number().int("Whole number").min(min, msg).max(max, msg);

const targetsSchema = z
  .object({
    kcalTarget: int(1000, 5000, "1000–5000"),
    kcalMin: int(1000, 5000, "1000–5000"),
    kcalMax: int(1000, 5000, "1000–5000"),
    proteinMinVeg: int(20, 400, "20–400"),
    proteinMaxVeg: int(20, 400, "20–400"),
    proteinMinNonveg: int(20, 400, "20–400"),
    proteinMaxNonveg: int(20, 400, "20–400"),
    stepsMin: int(0, 50_000, "0–50,000"),
    stepsMax: int(0, 50_000, "0–50,000"),
    budgetVegInr: int(0, 100_000, "0–1,00,000"),
    budgetNonvegInr: int(0, 100_000, "0–1,00,000"),
  })
  .refine((v) => v.kcalMin <= v.kcalTarget && v.kcalTarget <= v.kcalMax, { message: "min ≤ target ≤ max", path: ["kcalTarget"] })
  .refine((v) => v.proteinMinVeg <= v.proteinMaxVeg, { message: "min ≤ max", path: ["proteinMaxVeg"] })
  .refine((v) => v.proteinMinNonveg <= v.proteinMaxNonveg, { message: "min ≤ max", path: ["proteinMaxNonveg"] })
  .refine((v) => v.stepsMin <= v.stepsMax, { message: "min ≤ max", path: ["stepsMax"] });

function formFail(err: unknown): FormState {
  if (err instanceof z.ZodError) {
    const fe: Record<string, string> = {};
    for (const i of err.issues) fe[String(i.path[0] ?? "")] ??= i.message;
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fe };
  }
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
}

export async function saveTargets(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  try {
    const v = targetsSchema.parse(Object.fromEntries(formData));
    await db.update(settings).set({ ...v, updatedAt: new Date() }).where(eq(settings.id, 1));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return formFail(e);
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bad date");

export async function savePhase(input: { override: "auto" | "veg" | "nonveg"; switchDate: string }): Promise<ActionResult> {
  await requireSession();
  try {
    const override = z.enum(["auto", "veg", "nonveg"]).parse(input.override);
    const switchDate = isoDate.parse(input.switchDate);
    await db
      .update(settings)
      .set({ phaseOverride: override === "auto" ? null : override, phaseSwitchDate: switchDate, updatedAt: new Date() })
      .where(eq(settings.id, 1));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveBodyStats(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  try {
    const v = bodyStatsSchema.parse(Object.fromEntries(formData));
    await db.update(settings).set({ ...v, updatedAt: new Date() }).where(eq(settings.id, 1));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return formFail(e);
  }
}

export async function saveSmokeFreeSince(date: string): Promise<ActionResult> {
  await requireSession();
  try {
    const d = date === "" ? null : isoDate.refine((x) => x <= todayIST(), "Date is in the future").parse(date);
    await db.update(settings).set({ smokeFreeSince: d, updatedAt: new Date() }).where(eq(settings.id, 1));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* =================================== foods =================================== */

const num = (min: number, max: number, msg: string) => z.coerce.number().min(min, msg).max(max, msg);

const foodSchema = z.object({
  name: z.string().trim().min(1, "Name required").max(60, "Too long"),
  servingLabel: z.string().trim().min(1, "Serving required").max(40, "Too long"),
  servingGrams: z.union([z.literal("").transform(() => null), num(0.1, 5000, "0.1–5000")]),
  kcal: num(0, 5000, "0–5000"),
  proteinG: num(0, 500, "0–500"),
  costInr: z.union([z.literal("").transform(() => 0), num(0, 10_000, "0–10,000")]),
  phaseTag: z.enum(["veg", "nonveg", "both"]),
  isFavourite: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

/** Insert when `id` is empty, else update. Archive is separate. */
export async function saveFood(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  try {
    const raw = Object.fromEntries(formData);
    const id = raw.id === "" || raw.id === undefined ? null : z.coerce.number().int().positive().parse(raw.id);
    const v = foodSchema.parse(raw);
    if (id === null) await db.insert(foods).values(v);
    else await db.update(foods).set({ ...v, updatedAt: new Date() }).where(eq(foods.id, id));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && /foods_name_uq/.test(e.message)) return { ok: false, error: "A food with that name already exists.", fieldErrors: { name: "Duplicate" } };
    return formFail(e);
  }
}

export async function setFoodArchived(id: number, archived: boolean): Promise<ActionResult> {
  await requireSession();
  try {
    await db.update(foods).set({ archived: z.boolean().parse(archived), updatedAt: new Date() }).where(eq(foods.id, z.number().int().positive().parse(id)));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setFoodFavourite(id: number, isFavourite: boolean): Promise<ActionResult> {
  await requireSession();
  try {
    await db.update(foods).set({ isFavourite: z.boolean().parse(isFavourite), updatedAt: new Date() }).where(eq(foods.id, z.number().int().positive().parse(id)));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ================================== routine ================================== */

const id = z.number().int().positive();

async function dayRows(dayId: number) {
  return db
    .select({ exerciseId: routineExercises.exerciseId, sortOrder: routineExercises.sortOrder })
    .from(routineExercises)
    .where(eq(routineExercises.routineDayId, dayId))
    .orderBy(asc(routineExercises.sortOrder));
}

export async function moveRoutineExercise(dayId: number, exerciseId: number, dir: "up" | "down"): Promise<ActionResult> {
  await requireSession();
  try {
    const d = id.parse(dayId);
    const ex = id.parse(exerciseId);
    const rows = await dayRows(d);
    const i = rows.findIndex((r) => r.exerciseId === ex);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= rows.length) return { ok: true };
    // Renumber 1..n with the two swapped, so legacy gaps/duplicates heal.
    const order = rows.map((r) => r.exerciseId);
    [order[i], order[j]] = [order[j], order[i]];
    for (const [k, exId] of order.entries()) {
      await db.update(routineExercises).set({ sortOrder: k + 1 }).where(and(eq(routineExercises.routineDayId, d), eq(routineExercises.exerciseId, exId)));
    }
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setRoutineTargets(dayId: number, exerciseId: number, sets: number, reps: number): Promise<ActionResult> {
  await requireSession();
  try {
    const v = { targetSets: int(1, 10, "1–10").parse(sets), targetReps: int(1, 50, "1–50").parse(reps) };
    await db.update(routineExercises).set(v).where(and(eq(routineExercises.routineDayId, id.parse(dayId)), eq(routineExercises.exerciseId, id.parse(exerciseId))));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeRoutineExercise(dayId: number, exerciseId: number): Promise<ActionResult> {
  await requireSession();
  try {
    await db.delete(routineExercises).where(and(eq(routineExercises.routineDayId, id.parse(dayId)), eq(routineExercises.exerciseId, id.parse(exerciseId))));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const addSchema = z.union([z.object({ exerciseId: id }), z.object({ name: z.string().trim().min(1, "Name required").max(60, "Too long"), muscleGroup: z.enum(MUSCLE_GROUPS) })]);

export async function addRoutineExercise(dayId: number, input: { exerciseId: number } | { name: string; muscleGroup: string }): Promise<ActionResult> {
  await requireSession();
  try {
    const d = id.parse(dayId);
    const v = addSchema.parse(input);
    const exerciseId = "exerciseId" in v ? v.exerciseId : await findOrCreateExercise(v.name, v.muscleGroup);
    const rows = await dayRows(d);
    if (rows.some((r) => r.exerciseId === exerciseId)) return { ok: false, error: "Already in this workout type." };
    await db.insert(routineExercises).values({ routineDayId: d, exerciseId, sortOrder: (rows.at(-1)?.sortOrder ?? 0) + 1 });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* =============================== workout types =============================== */

const typeName = z.string().trim().min(1, "Name required").max(30, "30 characters max");

/** Reserved bot words block the name; a food with the same name only warns (the type wins in the bot). */
async function checkTypeName(name: string, exceptId?: number): Promise<{ error: string } | { warning: string | null }> {
  const lower = name.toLowerCase();
  if ((BOT_COMMAND_WORDS as readonly string[]).includes(lower)) return { error: `"${name}" is a bot command — pick another name.` };
  const types = await listWorkoutTypes({ includeArchived: true });
  if (types.some((t) => t.id !== exceptId && (t.name.toLowerCase() === lower || t.label.toLowerCase() === lower))) return { error: "A workout type with that name exists." };
  const food = matchFood(name, await listFoods());
  const warning =
    food && food.name.toLowerCase() === lower
      ? `"${food.name}" is also a food. In Telegram, "${name}" will now set the day instead of logging the food.`
      : null;
  return { warning };
}

/** Renumber: active types in the given order 1..n, archived after them. */
async function renumberTypes(activeOrder: number[]) {
  const archived = (await listWorkoutTypes({ includeArchived: true })).filter((t) => t.archived).map((t) => t.id);
  for (const [k, typeId] of [...activeOrder, ...archived].entries()) {
    await db.update(routineDays).set({ sortOrder: k + 1 }).where(eq(routineDays.id, typeId));
  }
}

export async function addWorkoutType(name: string): Promise<ActionResult<{ warning: string | null }>> {
  await requireSession();
  try {
    const n = typeName.parse(name);
    const check = await checkTypeName(n);
    if ("error" in check) return { ok: false, error: check.error };
    const active = await listWorkoutTypes();
    const [row] = await db.insert(routineDays).values({ name: n, sortOrder: active.length + 1 }).returning({ id: routineDays.id });
    await renumberTypes([...active.map((t) => t.id), row.id]);
    revalidateAll();
    return { ok: true, warning: check.warning };
  } catch (e) {
    return fail(e);
  }
}

export async function renameWorkoutType(typeId: number, name: string): Promise<ActionResult<{ warning: string | null }>> {
  await requireSession();
  try {
    const t = id.parse(typeId);
    const n = typeName.parse(name);
    const check = await checkTypeName(n, t);
    if ("error" in check) return { ok: false, error: check.error };
    await db.update(routineDays).set({ name: n }).where(eq(routineDays.id, t));
    revalidateAll();
    return { ok: true, warning: check.warning };
  } catch (e) {
    return fail(e);
  }
}

/** Move within the rotation (active types only). */
export async function moveWorkoutType(typeId: number, dir: "up" | "down"): Promise<ActionResult> {
  await requireSession();
  try {
    const order = (await listWorkoutTypes()).map((t) => t.id);
    const i = order.indexOf(id.parse(typeId));
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= order.length) return { ok: true };
    [order[i], order[j]] = [order[j], order[i]];
    await renumberTypes(order);
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Archive hides a type from the picker and rotation (history stays); restore puts it at the end of the rotation. */
export async function setWorkoutTypeArchived(typeId: number, archived: boolean): Promise<ActionResult> {
  await requireSession();
  try {
    const t = id.parse(typeId);
    await db.update(routineDays).set({ archived: z.boolean().parse(archived) }).where(eq(routineDays.id, t));
    const active = (await listWorkoutTypes()).map((x) => x.id).filter((x) => x !== t);
    await renumberTypes(archived ? active : [...active, t]);
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveWeeklySessionTarget(n: number): Promise<ActionResult> {
  await requireSession();
  try {
    await db.update(settings).set({ weeklySessionTarget: int(1, 14, "1–14").parse(n), updatedAt: new Date() }).where(eq(settings.id, 1));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveExerciseCues(exerciseId: number, cues: string): Promise<ActionResult> {
  await requireSession();
  try {
    const c = z.string().trim().max(1000, "Too long").parse(cues);
    await db.update(exercises).set({ cues: c === "" ? null : c }).where(eq(exercises.id, id.parse(exerciseId)));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ================================== telegram ================================= */

export async function regenerateLinkCode(): Promise<ActionResult<{ code: string }>> {
  await requireSession();
  try {
    const code = randomBytes(4).toString("hex").toUpperCase();
    await db.update(settings).set({ telegramLinkCode: code, updatedAt: new Date() }).where(eq(settings.id, 1));
    revalidateAll();
    return { ok: true, code };
  } catch (e) {
    return fail(e);
  }
}

export async function unlinkTelegram(): Promise<ActionResult> {
  await requireSession();
  try {
    await db.update(settings).set({ telegramChatId: null, updatedAt: new Date() }).where(eq(settings.id, 1));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
