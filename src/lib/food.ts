import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { foodLog, foods, type Food, type FoodLog } from "@/db/schema";
import { nowTimeIST } from "@/lib/dates";
import { MEAL_SERVING } from "@/lib/format";

export type { Food, FoodLog };

/** Active (non-archived) foods, favourites first then by name. */
export function listFoods(): Promise<Food[]> {
  return db.select().from(foods).where(eq(foods.archived, false)).orderBy(desc(foods.isFavourite), asc(foods.name));
}

export function listFoodLog(date: string): Promise<FoodLog[]> {
  return db.select().from(foodLog).where(eq(foodLog.date, date)).orderBy(asc(foodLog.time), asc(foodLog.id));
}

// Re-exported for server callers; the implementation lives in metrics/phase.ts so client components can import it without pulling in the db.
export { foodInPhase } from "@/lib/metrics/phase";

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

/** The most recent entry of the day (by logged time), or null. */
export async function latestFoodEntry(date: string): Promise<FoodLog | null> {
  const [row] = await db.select().from(foodLog).where(eq(foodLog.date, date)).orderBy(desc(foodLog.time), desc(foodLog.id)).limit(1);
  return row ?? null;
}

export async function deleteFoodEntry(id: number): Promise<void> {
  await db.delete(foodLog).where(eq(foodLog.id, id));
}

/* -------------------------------- my meals -------------------------------- */
/* A saved meal is a favourite food whose serving is one whole meal — so it shows in the Today
   quick row, matches by name in the bot and is editable in Settings → Foods with no extra table. */

/** Save (or update) a meal by name. Refuses to overwrite a regular catalogue food of the same name. */
export async function saveMeal(m: { label: string; kcal: number; proteinG: number }): Promise<Food | { error: string }> {
  const [existing] = await db.select().from(foods).where(sql`lower(${foods.name}) = ${m.label.toLowerCase()}`).limit(1);
  if (existing && existing.servingLabel !== MEAL_SERVING) return { error: `"${existing.name}" is already a food — pick another meal name.` };
  const values = { kcal: r(m.kcal, 1), proteinG: r(m.proteinG, 1), isFavourite: true, archived: false };
  if (existing) {
    const [row] = await db.update(foods).set({ ...values, updatedAt: new Date() }).where(eq(foods.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(foods).values({ name: m.label, servingLabel: MEAL_SERVING, phaseTag: "both", costInr: 0, ...values }).returning();
  return row;
}

/** Copy every entry of `from` onto `to` (times set to now). Returns the number copied. */
export async function copyFoodLog(from: string, to: string, source: FoodSource): Promise<number> {
  const rows = await listFoodLog(from);
  const time = nowTimeIST();
  const ids = await insertFoodEntries(
    rows.map((e) => ({ date: to, time, foodId: e.foodId, label: e.label, qty: e.qty, kcal: e.kcal, proteinG: e.proteinG, costInr: e.costInr, source })),
  );
  return ids.length;
}
