/** Measurement writes shared by the Trends form and the bot. One row per date. */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { measurements } from "@/db/schema";

export type MeasurementPatch = { navelCm?: number | null; waistCm?: number | null; notes?: string | null };

/** Update the row for `date` if it exists (only the provided fields), else insert. Returns the id. */
export async function upsertMeasurementByDate(date: string, patch: MeasurementPatch): Promise<number> {
  const [existing] = await db.select({ id: measurements.id }).from(measurements).where(eq(measurements.date, date)).limit(1);
  if (existing) {
    await db.update(measurements).set(patch).where(eq(measurements.id, existing.id));
    return existing.id;
  }
  const [row] = await db.insert(measurements).values({ date, ...patch }).returning({ id: measurements.id });
  return row.id;
}
