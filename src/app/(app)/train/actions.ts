"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { activities, exercises, sessionExercises, sessions, sets } from "@/db/schema";
import { fail, type ActionResult } from "@/lib/action-result";
import { ISO_DATE } from "@/lib/dates";
import { MUSCLE_GROUPS } from "@/lib/routine";
import { requireSession } from "@/lib/session";
import { createSession } from "@/lib/training";

const dateSchema = z.string().regex(ISO_DATE, "Bad date");
const id = z.number().int().positive();

function revalidate() {
  revalidatePath("/train");
  revalidatePath("/today");
}

/* --------------------------------- session --------------------------------- */

export async function startSession(date: string, routineDayId: number | null): Promise<ActionResult<{ sessionId: number }>> {
  await requireSession();
  try {
    const d = dateSchema.parse(date);
    const rd = routineDayId === null ? null : id.parse(routineDayId);
    const { sessionId } = await createSession(d, rd);
    revalidate();
    return { ok: true, sessionId };
  } catch (e) {
    return fail(e);
  }
}

export async function discardSession(sessionId: number): Promise<ActionResult> {
  await requireSession();
  try {
    await db.delete(sessions).where(eq(sessions.id, id.parse(sessionId)));
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setInclineWalk(sessionId: number, value: boolean): Promise<ActionResult> {
  await requireSession();
  try {
    await db.update(sessions).set({ inclineWalk: z.boolean().parse(value) }).where(eq(sessions.id, id.parse(sessionId)));
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveSessionNotes(sessionId: number, notes: string): Promise<ActionResult> {
  await requireSession();
  try {
    const n = z.string().trim().max(500, "Notes too long").parse(notes);
    await db.update(sessions).set({ notes: n === "" ? null : n }).where(eq(sessions.id, id.parse(sessionId)));
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ---------------------------------- sets ----------------------------------- */

const setSchema = z.object({
  sessionId: id,
  exerciseId: id,
  setNo: z.number().int().min(1).max(30),
  weightKg: z.coerce.number().min(0, "0–500 kg").max(500, "0–500 kg"),
  reps: z.coerce.number().int("Whole reps").min(1, "1–100 reps").max(100, "1–100 reps"),
});

export async function upsertSet(input: {
  sessionId: number;
  exerciseId: number;
  setNo: number;
  weightKg: string;
  reps: string;
}): Promise<ActionResult> {
  await requireSession();
  try {
    const v = setSchema.parse(input);
    await db
      .insert(sets)
      .values({ ...v, isWorking: true })
      .onConflictDoUpdate({
        target: [sets.sessionId, sets.exerciseId, sets.setNo],
        set: { weightKg: v.weightKg, reps: v.reps },
      });
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSet(sessionId: number, exerciseId: number, setNo: number): Promise<ActionResult> {
  await requireSession();
  try {
    await db
      .delete(sets)
      .where(and(eq(sets.sessionId, id.parse(sessionId)), eq(sets.exerciseId, id.parse(exerciseId)), eq(sets.setNo, z.number().int().parse(setNo))));
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------- + exercise -------------------------------- */

const addExerciseSchema = z.union([
  z.object({ exerciseId: id }),
  z.object({ name: z.string().trim().min(1, "Name required").max(60, "Name too long"), muscleGroup: z.enum(MUSCLE_GROUPS) }),
]);

/** Add an existing exercise, or create a custom one, and attach it to this session only. */
export async function addExerciseToSession(
  sessionId: number,
  input: { exerciseId: number } | { name: string; muscleGroup: string },
): Promise<ActionResult<{ exerciseId: number }>> {
  await requireSession();
  try {
    const sid = id.parse(sessionId);
    const v = addExerciseSchema.parse(input);

    let exerciseId: number;
    if ("exerciseId" in v) {
      const [ex] = await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.id, v.exerciseId)).limit(1);
      if (!ex) return { ok: false, error: "Exercise not found" };
      exerciseId = ex.id;
    } else {
      const [existing] = await db
        .select({ id: exercises.id })
        .from(exercises)
        .where(sql`lower(${exercises.name}) = lower(${v.name})`)
        .limit(1);
      if (existing) exerciseId = existing.id;
      else {
        const [created] = await db
          .insert(exercises)
          .values({ name: v.name, muscleGroup: v.muscleGroup, isCustom: true })
          .returning({ id: exercises.id });
        exerciseId = created.id;
      }
    }

    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${sessionExercises.sortOrder}), 0)::int` })
      .from(sessionExercises)
      .where(eq(sessionExercises.sessionId, sid));
    await db.insert(sessionExercises).values({ sessionId: sid, exerciseId, sortOrder: max + 1 }).onConflictDoNothing();

    revalidate();
    return { ok: true, exerciseId };
  } catch (e) {
    return fail(e);
  }
}

/* -------------------------------- activities ------------------------------- */

const activitySchema = z.object({
  name: z.string().trim().min(1, "Name required").max(60, "Name too long"),
  minutes: z.coerce.number().int("Whole minutes").min(1, "1–600 min").max(600, "1–600 min"),
  notes: z.string().trim().max(200, "Note too long").transform((s) => (s === "" ? null : s)),
});

export async function addActivity(
  date: string,
  input: { name: string; minutes: string; notes: string },
): Promise<ActionResult<{ id: number }>> {
  await requireSession();
  try {
    const d = dateSchema.parse(date);
    const v = activitySchema.parse(input);
    const [row] = await db.insert(activities).values({ date: d, ...v }).returning({ id: activities.id });
    revalidate();
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteActivity(activityId: number): Promise<ActionResult> {
  await requireSession();
  try {
    await db.delete(activities).where(eq(activities.id, id.parse(activityId)));
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
