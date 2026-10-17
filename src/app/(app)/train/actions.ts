"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { exercises, sessionExercises, sessions, sets } from "@/db/schema";
import { deleteCardio, insertCardio, repeatLastCardio, updateCardio } from "@/lib/activities";
import type { CardioInput } from "@/lib/cardio";
import { fail, type ActionResult } from "@/lib/action-result";
import { ISO_DATE } from "@/lib/dates";
import { MUSCLE_GROUPS } from "@/lib/routine";
import { requireSession } from "@/lib/session";
import { addExerciseToType, copyLastSets, findOrCreateExercise } from "@/lib/training";

const dateSchema = z.string().regex(ISO_DATE, "Bad date");
const id = z.number().int().positive();

function revalidate() {
  revalidatePath("/train");
  revalidatePath("/today");
}

/* --------------------------------- session --------------------------------- */

/** ✓ Same as last time — one exercise, or every unlogged exercise when `exerciseId` is omitted. */
export async function sameAsLast(sessionId: number, exerciseId?: number): Promise<ActionResult<{ filled: number }>> {
  await requireSession();
  try {
    const filled = await copyLastSets(id.parse(sessionId), exerciseId === undefined ? undefined : [id.parse(exerciseId)]);
    revalidate();
    return { ok: true, filled };
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

/** Add an existing exercise (full library) or create a new one, attach it to this session, and optionally to its workout type. */
export async function addExerciseToSession(
  sessionId: number,
  input: { exerciseId: number } | { name: string; muscleGroup: string },
  alsoAddToType = false,
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
      exerciseId = await findOrCreateExercise(v.name, v.muscleGroup);
    }

    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${sessionExercises.sortOrder}), 0)::int` })
      .from(sessionExercises)
      .where(eq(sessionExercises.sessionId, sid));
    await db.insert(sessionExercises).values({ sessionId: sid, exerciseId, sortOrder: max + 1 }).onConflictDoNothing();
    if (z.boolean().parse(alsoAddToType)) {
      const [sess] = await db.select({ typeId: sessions.routineDayId }).from(sessions).where(eq(sessions.id, sid)).limit(1);
      if (sess?.typeId) await addExerciseToType(sess.typeId, exerciseId);
    }

    revalidate();
    return { ok: true, exerciseId };
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------------- cardio ---------------------------------- */

/** Add a cardio entry (validation + speed ⇄ distance derivation in normalizeCardio). */
export async function addCardio(date: string, input: CardioInput): Promise<ActionResult<{ id: number }>> {
  await requireSession();
  try {
    const e = await insertCardio(dateSchema.parse(date), input);
    revalidate();
    return { ok: true, id: e.id };
  } catch (e) {
    return fail(e);
  }
}

export async function editCardio(entryId: number, input: CardioInput): Promise<ActionResult> {
  await requireSession();
  try {
    const e = await updateCardio(id.parse(entryId), input);
    if (!e) return { ok: false, error: "Entry not found" };
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeCardio(entryId: number): Promise<ActionResult> {
  await requireSession();
  try {
    await deleteCardio(id.parse(entryId));
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** "Same as last time": copy the most recent entry onto `date` with the current time. */
export async function repeatCardio(date: string): Promise<ActionResult> {
  await requireSession();
  try {
    const e = await repeatLastCardio(dateSchema.parse(date));
    if (!e) return { ok: false, error: "No earlier cardio to repeat" };
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
