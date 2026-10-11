"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { fail, type ActionResult } from "@/lib/action-result";
import { requireSession } from "@/lib/session";

import { NUDGE_TOGGLES, type NudgeToggle } from "@/lib/nudges";

const toggleSchema = z.enum(NUDGE_TOGGLES);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export async function setNudgeToggle(key: NudgeToggle, value: boolean): Promise<ActionResult> {
  await requireSession();
  try {
    const k = toggleSchema.parse(key);
    await db.update(settings).set({ [k]: z.boolean().parse(value), updatedAt: new Date() }).where(eq(settings.id, 1));
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveQuietHours(start: string, end: string): Promise<ActionResult> {
  await requireSession();
  try {
    const s = hhmm.parse(start);
    const e = hhmm.parse(end);
    await db.update(settings).set({ quietHoursStart: s, quietHoursEnd: e, updatedAt: new Date() }).where(eq(settings.id, 1));
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function saveDailyCap(cap: number): Promise<ActionResult> {
  await requireSession();
  try {
    const c = z.coerce.number().int("Whole number").min(1, "1–20").max(20, "1–20").parse(cap);
    await db.update(settings).set({ nudgeDailyCap: c, updatedAt: new Date() }).where(eq(settings.id, 1));
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
