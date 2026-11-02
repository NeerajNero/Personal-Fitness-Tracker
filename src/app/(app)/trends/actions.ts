"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { settings } from "@/db/schema";
import { fail, type ActionResult } from "@/lib/action-result";
import { ISO_DATE, todayIST } from "@/lib/dates";
import { forUser } from "@/lib/db/scope";
import { deleteMeasurement as deleteMeasurementRow, upsertMeasurementByDate } from "@/lib/measurements";
import { requireUser } from "@/lib/session";

const cm = z.union([z.literal("").transform(() => null), z.coerce.number().min(40, "40–200 cm").max(200, "40–200 cm")]);

const measurementSchema = z
  .object({
    date: z.string().regex(ISO_DATE, "Bad date").refine((d) => d <= todayIST(), "Date is in the future"),
    navelCm: cm,
    waistCm: cm,
    notes: z.string().trim().max(200).transform((s) => (s === "" ? null : s)),
  })
  .refine((v) => v.navelCm !== null || v.waistCm !== null, { message: "Enter navel or waist", path: ["navelCm"] });

/** One measurement per date: update if that date exists, else insert. */
export async function upsertMeasurement(input: { date: string; navelCm: string; waistCm: string; notes: string }): Promise<ActionResult<{ id: number }>> {
  const userId = await requireUser();
  try {
    const v = measurementSchema.parse(input);
    const id = await upsertMeasurementByDate(userId, v.date, { navelCm: v.navelCm, waistCm: v.waistCm, notes: v.notes });
    revalidatePath("/trends");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteMeasurement(id: number): Promise<ActionResult> {
  const userId = await requireUser();
  try {
    await deleteMeasurementRow(userId, z.number().int().positive().parse(id));
    revalidatePath("/trends");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Apply a suggested calorie target (±25 range). Only ever called from an explicit confirm. */
export async function applyKcalTarget(target: number): Promise<ActionResult> {
  const userId = await requireUser();
  try {
    const t = z.number().int().min(1200, "Too low to be safe").max(4000, "Too high").parse(target);
    const u = forUser(userId);
    await u.db.update(settings).set({ kcalTarget: t, kcalMin: t - 25, kcalMax: t + 25, updatedAt: new Date() }).where(u.own(settings));
    revalidatePath("/trends");
    revalidatePath("/today");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
