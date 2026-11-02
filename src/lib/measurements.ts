/** Measurement writes shared by the Trends form and the bot. One row per (user, date). */
import { eq } from "drizzle-orm";
import { measurements } from "@/db/schema";
import { forUser, type UserId } from "@/lib/db/scope";

export type MeasurementPatch = { navelCm?: number | null; waistCm?: number | null; notes?: string | null };

/** Update the row for `date` if it exists (only the provided fields), else insert. Returns the id. */
export async function upsertMeasurementByDate(userId: UserId, date: string, patch: MeasurementPatch): Promise<number> {
  const u = forUser(userId);
  const [existing] = await u.db.select({ id: measurements.id }).from(measurements).where(u.own(measurements, eq(measurements.date, date))).limit(1);
  if (existing) {
    await u.db.update(measurements).set(patch).where(u.own(measurements, eq(measurements.id, existing.id)));
    return existing.id;
  }
  const [row] = await u.db.insert(measurements).values(u.stamp({ date, ...patch })).returning({ id: measurements.id });
  return row.id;
}

export async function deleteMeasurement(userId: UserId, id: number): Promise<void> {
  const u = forUser(userId);
  await u.db.delete(measurements).where(u.own(measurements, eq(measurements.id, id)));
}
