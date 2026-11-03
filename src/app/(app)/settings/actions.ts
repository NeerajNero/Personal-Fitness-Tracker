"use server";

import { randomBytes } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exercises, foods, routineDays, routineExercises, settings } from "@/db/schema";
import { bodyStatsSchema } from "@/lib/body-stats";
import { todayIST } from "@/lib/dates";
import { forUser, type UserId } from "@/lib/db/scope";
import { listFoods } from "@/lib/food";
import { BOT_COMMAND_WORDS, MUSCLE_GROUPS } from "@/lib/routine";
import { hasBudgets, hasPhases, getSettings } from "@/lib/settings";
import { matchFood } from "@/lib/telegram/parse";
import { findOrCreateExercise, listWorkoutTypes, setRoutineRung as moveRung } from "@/lib/training";
import { action, fail, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/session";

import { NUDGE_TOGGLES, type NudgeToggle } from "@/lib/nudges";

/** Every settings write is `update … where user_id = me`. */
function patchSettings(userId: UserId, values: Partial<typeof settings.$inferInsert>) {
  const u = forUser(userId);
  return u.db.update(settings).set({ ...values, updatedAt: new Date() }).where(u.own(settings));
}

const toggleSchema = z.enum(NUDGE_TOGGLES);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const setNudgeToggle = action("setNudgeToggle", async (key: NudgeToggle, value: boolean): Promise<ActionResult> => {
  const userId = await requireUser();
  try {
    const k = toggleSchema.parse(key);
    await patchSettings(userId, { [k]: z.boolean().parse(value) });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
});

export const saveQuietHours = action("saveQuietHours", async (start: string, end: string): Promise<ActionResult> => {
  const userId = await requireUser();
  try {
    const s = hhmm.parse(start);
    const e = hhmm.parse(end);
    await patchSettings(userId, { quietHoursStart: s, quietHoursEnd: e });
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
});

export const saveDailyCap = action("saveDailyCap", async (cap: number): Promise<ActionResult> => {
  const userId = await requireUser();
  try {
    const c = z.coerce.number().int("Whole number").min(1, "1–20").max(20, "1–20").parse(cap);
    await patchSettings(userId, { nudgeDailyCap: c });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
});

/* ============================== targets & phase ============================== */

function revalidateAll() {
  for (const p of ["/settings", "/today", "/train", "/trends", "/onboarding/confirm"]) revalidatePath(p);
}

export type FormState = { ok: boolean; error?: string; fieldErrors?: Record<string, string> } | null;

const int = (min: number, max: number, msg: string) => z.coerce.number().int("Whole number").min(min, msg).max(max, msg);

const protein = int(20, 400, "20–400");
const baseTargets = z
  .object({
    kcalTarget: int(1000, 5000, "1000–5000"),
    kcalMin: int(1000, 5000, "1000–5000"),
    kcalMax: int(1000, 5000, "1000–5000"),
    stepsMin: int(0, 50_000, "0–50,000"),
    stepsMax: int(0, 50_000, "0–50,000"),
  })
  .refine((v) => v.kcalMin <= v.kcalTarget && v.kcalTarget <= v.kcalMax, { message: "min ≤ target ≤ max", path: ["kcalTarget"] })
  .refine((v) => v.stepsMin <= v.stepsMax, { message: "min ≤ max", path: ["stepsMax"] });

/** The owner's form: protein per phase (+ budgets when set). */
const phasedTargets = z
  .object({ proteinMinVeg: protein, proteinMaxVeg: protein, proteinMinNonveg: protein, proteinMaxNonveg: protein })
  .refine((v) => v.proteinMinVeg <= v.proteinMaxVeg, { message: "min ≤ max", path: ["proteinMaxVeg"] })
  .refine((v) => v.proteinMinNonveg <= v.proteinMaxNonveg, { message: "min ≤ max", path: ["proteinMaxNonveg"] });
const budgets = z.object({ budgetVegInr: int(0, 100_000, "0–1,00,000"), budgetNonvegInr: int(0, 100_000, "0–1,00,000") });
/** Everyone else: one protein range. */
const singleTargets = z.object({ proteinMin: protein, proteinMax: protein }).refine((v) => v.proteinMin <= v.proteinMax, { message: "min ≤ max", path: ["proteinMax"] });

function formFail(err: unknown): FormState {
  if (err instanceof z.ZodError) {
    const fe: Record<string, string> = {};
    for (const i of err.issues) fe[String(i.path[0] ?? "")] ??= i.message;
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fe };
  }
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
}

export const saveTargets = action("saveTargets", async (_prev: FormState, formData: FormData): Promise<FormState> => {
  const userId = await requireUser();
  try {
    const raw = Object.fromEntries(formData);
    const current = await getSettings(userId);
    const v = {
      ...baseTargets.parse(raw),
      ...(hasPhases(current) ? phasedTargets.parse(raw) : singleTargets.parse(raw)),
      ...(hasBudgets(current) ? budgets.parse(raw) : {}),
    };
    await patchSettings(userId, v);
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return formFail(e);
  }
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bad date");

export const savePhase = action("savePhase", async (input: { override: "auto" | "veg" | "nonveg"; switchDate: string }): Promise<ActionResult> => {
  const userId = await requireUser();
  try {
    const override = z.enum(["auto", "veg", "nonveg"]).parse(input.override);
    const switchDate = isoDate.parse(input.switchDate);
    await patchSettings(userId, { phaseOverride: override === "auto" ? null : override, phaseSwitchDate: switchDate });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
});

export const saveBodyStats = action("saveBodyStats", async (_prev: FormState, formData: FormData): Promise<FormState> => {
  const userId = await requireUser();
  try {
    const v = bodyStatsSchema.parse(Object.fromEntries(formData));
    await patchSettings(userId, { ...v });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return formFail(e);
  }
});

export const saveSmokeFreeSince = action("saveSmokeFreeSince", async (date: string): Promise<ActionResult> => {
  const userId = await requireUser();
  try {
    const d = date === "" ? null : isoDate.refine((x) => x <= todayIST(), "Date is in the future").parse(date);
    await patchSettings(userId, { smokeFreeSince: d });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
});

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
export const saveFood = action("saveFood", async (_prev: FormState, formData: FormData): Promise<FormState> => {
  const userId = await requireUser();
  try {
    const raw = Object.fromEntries(formData);
    const id = raw.id === "" || raw.id === undefined ? null : z.coerce.number().int().positive().parse(raw.id);
    const v = foodSchema.parse(raw);
    const u = forUser(userId);
    if (id === null) await u.db.insert(foods).values(u.stamp(v));
    else await u.db.update(foods).set({ ...v, updatedAt: new Date() }).where(u.own(foods, eq(foods.id, id)));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && /foods_user_name_uq/.test(e.message)) return { ok: false, error: "A food with that name already exists.", fieldErrors: { name: "Duplicate" } };
    return formFail(e);
  }
});

export const setFoodArchived = action("setFoodArchived", async (id: number, archived: boolean): Promise<ActionResult> => {
  const userId = await requireUser();
  try {
    const u = forUser(userId);
    await u.db.update(foods).set({ archived: z.boolean().parse(archived), updatedAt: new Date() }).where(u.own(foods, eq(foods.id, z.number().int().positive().parse(id))));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
});

export const setFoodFavourite = action("setFoodFavourite", async (id: number, isFavourite: boolean): Promise<ActionResult> => {
  const userId = await requireUser();
  try {
    const u = forUser(userId);
    await u.db.update(foods).set({ isFavourite: z.boolean().parse(isFavourite), updatedAt: new Date() }).where(u.own(foods, eq(foods.id, z.number().int().positive().parse(id))));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
});

/* ================================== routine ================================== */

const id = z.number().int().positive();

async function dayRows(userId: UserId, dayId: number) {
  const u = forUser(userId);
  return u.db
    .select({ exerciseId: routineExercises.exerciseId, sortOrder: routineExercises.sortOrder })
    .from(routineExercises)
    .where(u.own(routineExercises, eq(routineExercises.routineDayId, dayId)))
    .orderBy(asc(routineExercises.sortOrder));
}

const routineRow = (userId: UserId, dayId: number, exerciseId: number) => {
  const u = forUser(userId);
  return u.own(routineExercises, eq(routineExercises.routineDayId, dayId), eq(routineExercises.exerciseId, exerciseId));
};

export const moveRoutineExercise = action("moveRoutineExercise", async (dayId: number, exerciseId: number, dir: "up" | "down"): Promise<ActionResult> => {
  const userId = await requireUser();
  try {
    const d = id.parse(dayId);
    const ex = id.parse(exerciseId);
    const rows = await dayRows(userId, d);
    const i = rows.findIndex((r) => r.exerciseId === ex);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= rows.length) return { ok: true };
    // Renumber 1..n with the two swapped, so legacy gaps/duplicates heal.
    const order = rows.map((r) => r.exerciseId);
    [order[i], order[j]] = [order[j], order[i]];
    for (const [k, exId] of order.entries()) {
      await forUser(userId).db.update(routineExercises).set({ sortOrder: k + 1 }).where(routineRow(userId, d, exId));
    }
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
});

export const setRoutineTargets = action("setRoutineTargets", async (dayId: number, exerciseId: number, sets: number, reps: number): Promise<ActionResult> => {
  const userId = await requireUser();
  try {
    const v = { targetSets: int(1, 10, "1–10").parse(sets), targetReps: int(1, 50, "1–50").parse(reps) };
    await forUser(userId).db.update(routineExercises).set(v).where(routineRow(userId, id.parse(dayId), id.parse(exerciseId)));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
});

/** Ladder exercises: one rung up or down in this type (Settings shows "rung n of m"). */
export const setRoutineRung = action("setRoutineRung", async (dayId: number, exerciseId: number, dir: "up" | "down"): Promise<ActionResult> => {
  const userId = await requireUser();
  try {
    const r = await moveRung(userId, id.parse(dayId), id.parse(exerciseId), z.enum(["up", "down"]).parse(dir));
    if (!r) return { ok: false, error: "That rung isn't available: you're at the end of the ladder, or it's already in this type" };
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
});

export const removeRoutineExercise = action("removeRoutineExercise", async (dayId: number, exerciseId: number): Promise<ActionResult> => {
  const userId = await requireUser();
  try {
    await forUser(userId).db.delete(routineExercises).where(routineRow(userId, id.parse(dayId), id.parse(exerciseId)));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
});

const addSchema = z.union([z.object({ exerciseId: id }), z.object({ name: z.string().trim().min(1, "Name required").max(60, "Too long"), muscleGroup: z.enum(MUSCLE_GROUPS) })]);

export const addRoutineExercise = action("addRoutineExercise", async (dayId: number, input: { exerciseId: number } | { name: string; muscleGroup: string }): Promise<ActionResult> => {
  const userId = await requireUser();
  try {
    const d = id.parse(dayId);
    const v = addSchema.parse(input);
    const u = forUser(userId);
    const exerciseId = "exerciseId" in v ? v.exerciseId : await findOrCreateExercise(userId, v.name, v.muscleGroup);
    const [day] = await u.db.select({ id: routineDays.id }).from(routineDays).where(u.own(routineDays, eq(routineDays.id, d))).limit(1);
    if (!day) return { ok: false, error: "Workout type not found." };
    const rows = await dayRows(userId, d);
    if (rows.some((r) => r.exerciseId === exerciseId)) return { ok: false, error: "Already in this workout type." };
    await u.db.insert(routineExercises).values(u.stamp({ routineDayId: d, exerciseId, sortOrder: (rows.at(-1)?.sortOrder ?? 0) + 1 }));
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
});

/* =============================== workout types =============================== */

const typeName = z.string().trim().min(1, "Name required").max(30, "30 characters max");

/** Reserved bot words block the name; a food with the same name only warns (the type wins in the bot). */
async function checkTypeName(userId: UserId, name: string, exceptId?: number): Promise<{ error: string } | { warning: string | null }> {
  const lower = name.toLowerCase();
  if ((BOT_COMMAND_WORDS as readonly string[]).includes(lower)) return { error: `"${name}" is a bot command — pick another name.` };
  const types = await listWorkoutTypes(userId, { includeArchived: true });
  if (types.some((t) => t.id !== exceptId && (t.name.toLowerCase() === lower || t.label.toLowerCase() === lower))) return { error: "A workout type with that name exists." };
  const food = matchFood(name, await listFoods(userId));
  const warning =
    food && food.name.toLowerCase() === lower
      ? `"${food.name}" is also a food. In Telegram, "${name}" will now set the day instead of logging the food.`
      : null;
  return { warning };
}

/** Renumber: active types in the given order 1..n, archived after them. */
async function renumberTypes(userId: UserId, activeOrder: number[]) {
  const u = forUser(userId);
  const archived = (await listWorkoutTypes(userId, { includeArchived: true })).filter((t) => t.archived).map((t) => t.id);
  for (const [k, typeId] of [...activeOrder, ...archived].entries()) {
    await u.db.update(routineDays).set({ sortOrder: k + 1 }).where(u.own(routineDays, eq(routineDays.id, typeId)));
  }
}

export const addWorkoutType = action("addWorkoutType", async (name: string): Promise<ActionResult<{ warning: string | null }>> => {
  const userId = await requireUser();
  try {
    const n = typeName.parse(name);
    const check = await checkTypeName(userId, n);
    if ("error" in check) return { ok: false, error: check.error };
    const u = forUser(userId);
    const active = await listWorkoutTypes(userId);
    const [row] = await u.db.insert(routineDays).values(u.stamp({ name: n, sortOrder: active.length + 1 })).returning({ id: routineDays.id });
    await renumberTypes(userId, [...active.map((t) => t.id), row.id]);
    revalidateAll();
    return { ok: true, warning: check.warning };
  } catch (e) {
    return fail(e);
  }
});

export const renameWorkoutType = action("renameWorkoutType", async (typeId: number, name: string): Promise<ActionResult<{ warning: string | null }>> => {
  const userId = await requireUser();
  try {
    const t = id.parse(typeId);
    const n = typeName.parse(name);
    const check = await checkTypeName(userId, n, t);
    if ("error" in check) return { ok: false, error: check.error };
    const u = forUser(userId);
    await u.db.update(routineDays).set({ name: n }).where(u.own(routineDays, eq(routineDays.id, t)));
    revalidateAll();
    return { ok: true, warning: check.warning };
  } catch (e) {
    return fail(e);
  }
});

/** Move within the rotation (active types only). */
export const moveWorkoutType = action("moveWorkoutType", async (typeId: number, dir: "up" | "down"): Promise<ActionResult> => {
  const userId = await requireUser();
  try {
    const order = (await listWorkoutTypes(userId)).map((t) => t.id);
    const i = order.indexOf(id.parse(typeId));
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= order.length) return { ok: true };
    [order[i], order[j]] = [order[j], order[i]];
    await renumberTypes(userId, order);
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
});

/** Archive hides a type from the picker and rotation (history stays); restore puts it at the end of the rotation. */
export const setWorkoutTypeArchived = action("setWorkoutTypeArchived", async (typeId: number, archived: boolean): Promise<ActionResult> => {
  const userId = await requireUser();
  try {
    const t = id.parse(typeId);
    const u = forUser(userId);
    await u.db.update(routineDays).set({ archived: z.boolean().parse(archived) }).where(u.own(routineDays, eq(routineDays.id, t)));
    const active = (await listWorkoutTypes(userId)).map((x) => x.id).filter((x) => x !== t);
    await renumberTypes(userId, archived ? active : [...active, t]);
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
});

export const saveWeeklySessionTarget = action("saveWeeklySessionTarget", async (n: number): Promise<ActionResult> => {
  const userId = await requireUser();
  try {
    await patchSettings(userId, { weeklySessionTarget: int(1, 14, "1–14").parse(n) });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
});

export const saveExerciseCues = action("saveExerciseCues", async (exerciseId: number, cues: string): Promise<ActionResult> => {
  const userId = await requireUser();
  try {
    const c = z.string().trim().max(1000, "Too long").parse(cues);
    // Library cues are shared, so only the user's own custom exercises can be edited here.
    const u = forUser(userId);
    const updated = await u.db.update(exercises).set({ cues: c === "" ? null : c }).where(u.own(exercises, eq(exercises.id, id.parse(exerciseId)))).returning({ id: exercises.id });
    if (updated.length === 0) return { ok: false, error: "Library cues are shared — only your own exercises can be edited." };
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
});

/* ================================== telegram ================================= */

export const regenerateLinkCode = action("regenerateLinkCode", async (): Promise<ActionResult<{ code: string }>> => {
  const userId = await requireUser();
  try {
    const code = randomBytes(4).toString("hex").toUpperCase();
    await patchSettings(userId, { telegramLinkCode: code });
    revalidateAll();
    return { ok: true, code };
  } catch (e) {
    return fail(e);
  }
});

export const unlinkTelegram = action("unlinkTelegram", async (): Promise<ActionResult> => {
  const userId = await requireUser();
  try {
    await patchSettings(userId, { telegramChatId: null });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
});
