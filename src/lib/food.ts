import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { foodLog, foods, type Food, type FoodLog } from "@/db/schema";
import { nowTimeIST } from "@/lib/dates";
import type { Phase } from "@/lib/metrics/phase";

export type { Food, FoodLog };

/** Active (non-archived) foods, favourites first then by name. */
export function listFoods(): Promise<Food[]> {
  return db.select().from(foods).where(eq(foods.archived, false)).orderBy(desc(foods.isFavourite), asc(foods.name));
}

export function listFoodLog(date: string): Promise<FoodLog[]> {
  return db.select().from(foodLog).where(eq(foodLog.date, date)).orderBy(asc(foodLog.time), asc(foodLog.id));
}

/** veg phase shows veg + both; nonveg phase shows everything. */
export function foodInPhase(food: Pick<Food, "phaseTag">, phase: Phase): boolean {
  return phase === "nonveg" || food.phaseTag !== "nonveg";
}

/* ----------------------------- shared writes ------------------------------ */
/* Used by the Today screen, the Telegram bot and the Gemini confirm path. */

export type NewFoodEntry = typeof foodLog.$inferInsert;
export type FoodSource = FoodLog["source"];

const r = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Insert values for `qty` servings of a catalogue food. */
export function entryFromFood(
  food: Pick<Food, "id" | "name" | "kcal" | "proteinG" | "costInr">,
  qty: number,
  date: string,
  source: FoodSource,
  time: string = nowTimeIST(),
): NewFoodEntry {
  return {
    date,
    time,
    foodId: food.id,
    label: food.name,
    qty,
    kcal: r(food.kcal * qty, 1),
    proteinG: r(food.proteinG * qty, 1),
    costInr: r(food.costInr * qty, 2),
    source,
  };
}

export async function insertFoodEntries(values: NewFoodEntry[]): Promise<number[]> {
  if (values.length === 0) return [];
  const rows = await db.insert(foodLog).values(values).returning({ id: foodLog.id });
  return rows.map((x) => x.id);
}

/** Delete the most recent entry of the day and return it (null when the day is empty). */
export async function deleteLatestFoodEntry(date: string): Promise<FoodLog | null> {
  const [row] = await db.select().from(foodLog).where(eq(foodLog.date, date)).orderBy(desc(foodLog.time), desc(foodLog.id)).limit(1);
  if (!row) return null;
  await db.delete(foodLog).where(eq(foodLog.id, row.id));
  return row;
}
