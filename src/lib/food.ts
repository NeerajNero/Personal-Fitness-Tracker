import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { foodLog, foods, type Food, type FoodLog } from "@/db/schema";
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
