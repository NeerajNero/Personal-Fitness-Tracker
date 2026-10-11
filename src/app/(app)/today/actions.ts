"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { dailyMetrics, foodLog, foods } from "@/db/schema";
import { fail, type ActionResult } from "@/lib/action-result";
import { ISO_DATE, nowTimeIST } from "@/lib/dates";
import { requireSession } from "@/lib/session";

const dateSchema = z.string().regex(ISO_DATE, "Bad date");
const qtySchema = z.coerce.number().positive("Qty must be > 0").max(50, "Qty too large");

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/* ------------------------------ daily metrics ------------------------------ */

const weightSchema = z.union([
  z.literal("").transform(() => null),
  z.coerce.number().min(30, "30–300 kg").max(300, "30–300 kg").transform((n) => round(n, 1)),
]);
const stepsSchema = z.union([
  z.literal("").transform(() => null),
  z.coerce.number().int("Whole number").min(0, "0–100,000").max(100_000, "0–100,000"),
]);

export async function saveWeight(date: string, raw: string): Promise<ActionResult> {
  await requireSession();
  try {
    const d = dateSchema.parse(date);
    const weightKg = weightSchema.parse(raw.trim());
    await db
      .insert(dailyMetrics)
      .values({ date: d, weightKg })
      .onConflictDoUpdate({ target: dailyMetrics.date, set: { weightKg, updatedAt: new Date() } });
    revalidatePath("/today");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveSteps(date: string, raw: string): Promise<ActionResult> {
  await requireSession();
  try {
    const d = dateSchema.parse(date);
    const steps = stepsSchema.parse(raw.trim());
    await db
      .insert(dailyMetrics)
      .values({ date: d, steps })
      .onConflictDoUpdate({ target: dailyMetrics.date, set: { steps, updatedAt: new Date() } });
    revalidatePath("/today");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------------- food log -------------------------------- */

/** Add `qty` servings of a catalogue food. */
export async function addFoodLog(date: string, foodId: number, qty: number): Promise<ActionResult<{ id: number }>> {
  await requireSession();
  try {
    const d = dateSchema.parse(date);
    const q = qtySchema.parse(qty);
    const [food] = await db.select().from(foods).where(eq(foods.id, z.number().int().parse(foodId))).limit(1);
    if (!food) return { ok: false, error: "Food not found" };
    const [row] = await db
      .insert(foodLog)
      .values({
        date: d,
        time: nowTimeIST(),
        foodId: food.id,
        label: food.name,
        qty: q,
        kcal: round(food.kcal * q, 1),
        proteinG: round(food.proteinG * q, 1),
        costInr: round(food.costInr * q, 2),
        source: "app",
      })
      .returning({ id: foodLog.id });
    revalidatePath("/today");
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

const quickAddSchema = z.object({
  label: z.string().trim().min(1, "Name required").max(80, "Name too long"),
  kcal: z.coerce.number().min(0, "kcal ≥ 0").max(5000, "kcal too large"),
  proteinG: z.coerce.number().min(0, "protein ≥ 0").max(500, "protein too large"),
  costInr: z.union([z.literal("").transform(() => 0), z.coerce.number().min(0).max(10_000)]),
});

/** One-off entry with no catalogue food (food_id null, qty 1). */
export async function quickAddFoodLog(
  date: string,
  input: { label: string; kcal: string; proteinG: string; costInr: string },
): Promise<ActionResult<{ id: number }>> {
  await requireSession();
  try {
    const d = dateSchema.parse(date);
    const v = quickAddSchema.parse(input);
    const [row] = await db
      .insert(foodLog)
      .values({
        date: d,
        time: nowTimeIST(),
        foodId: null,
        label: v.label,
        qty: 1,
        kcal: round(v.kcal, 1),
        proteinG: round(v.proteinG, 1),
        costInr: round(v.costInr, 2),
        source: "app",
      })
      .returning({ id: foodLog.id });
    revalidatePath("/today");
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

/** Change servings. Catalogue rows recompute from the food; quick-adds scale proportionally. */
export async function updateFoodLogQty(id: number, qty: number): Promise<ActionResult> {
  await requireSession();
  try {
    const q = qtySchema.parse(qty);
    const [row] = await db.select().from(foodLog).where(eq(foodLog.id, z.number().int().parse(id))).limit(1);
    if (!row) return { ok: false, error: "Entry not found" };

    let per = { kcal: row.kcal / row.qty, proteinG: row.proteinG / row.qty, costInr: row.costInr / row.qty };
    if (row.foodId !== null) {
      const [food] = await db.select().from(foods).where(eq(foods.id, row.foodId)).limit(1);
      if (food) per = { kcal: food.kcal, proteinG: food.proteinG, costInr: food.costInr };
    }
    await db
      .update(foodLog)
      .set({ qty: q, kcal: round(per.kcal * q, 1), proteinG: round(per.proteinG * q, 1), costInr: round(per.costInr * q, 2) })
      .where(eq(foodLog.id, row.id));
    revalidatePath("/today");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteFoodLog(id: number): Promise<ActionResult> {
  await requireSession();
  try {
    await db.delete(foodLog).where(eq(foodLog.id, z.number().int().parse(id)));
    revalidatePath("/today");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
