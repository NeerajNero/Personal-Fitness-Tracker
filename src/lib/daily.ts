/** daily_metrics writes shared by the Today screen and the Telegram bot. */
import { sql } from "drizzle-orm";
import { dailyMetrics } from "@/db/schema";
import { forUser, type UserId } from "@/lib/db/scope";

export type DailyPatch = Partial<{ weightKg: number | null; steps: number | null; waterGlasses: number | null }>;

export async function upsertDailyMetrics(userId: UserId, date: string, patch: DailyPatch): Promise<void> {
  const u = forUser(userId);
  await u.db
    .insert(dailyMetrics)
    .values(u.stamp({ date, ...patch }))
    .onConflictDoUpdate({ target: [dailyMetrics.userId, dailyMetrics.date], set: { ...patch, updatedAt: new Date() } });
}

/** +1 glass; returns the new count. */
export async function incrementWater(userId: UserId, date: string): Promise<number> {
  const u = forUser(userId);
  const [row] = await u.db
    .insert(dailyMetrics)
    .values(u.stamp({ date, waterGlasses: 1 }))
    .onConflictDoUpdate({
      target: [dailyMetrics.userId, dailyMetrics.date],
      set: { waterGlasses: sql`coalesce(${dailyMetrics.waterGlasses}, 0) + 1`, updatedAt: new Date() },
    })
    .returning({ waterGlasses: dailyMetrics.waterGlasses });
  return row.waterGlasses ?? 1;
}
