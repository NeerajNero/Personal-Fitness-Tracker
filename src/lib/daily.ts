/** daily_metrics writes shared by the Today screen and the Telegram bot. */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { dailyMetrics } from "@/db/schema";

export type DailyPatch = Partial<{ weightKg: number | null; steps: number | null; waterGlasses: number | null }>;

export async function upsertDailyMetrics(date: string, patch: DailyPatch): Promise<void> {
  await db
    .insert(dailyMetrics)
    .values({ date, ...patch })
    .onConflictDoUpdate({ target: dailyMetrics.date, set: { ...patch, updatedAt: new Date() } });
}

/** +1 glass; returns the new count. */
export async function incrementWater(date: string): Promise<number> {
  const [row] = await db
    .insert(dailyMetrics)
    .values({ date, waterGlasses: 1 })
    .onConflictDoUpdate({
      target: dailyMetrics.date,
      set: { waterGlasses: sql`coalesce(${dailyMetrics.waterGlasses}, 0) + 1`, updatedAt: new Date() },
    })
    .returning({ waterGlasses: dailyMetrics.waterGlasses });
  return row.waterGlasses ?? 1;
}
