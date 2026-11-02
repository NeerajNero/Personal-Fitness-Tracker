"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sessionExercises, sessions, sets } from "@/db/schema";
import { deleteCardio, insertCardio, repeatLastCardio, updateCardio } from "@/lib/activities";
import type { CardioInput } from "@/lib/cardio";
import { fail, type ActionResult } from "@/lib/action-result";
import { ISO_DATE } from "@/lib/dates";
import { forUser } from "@/lib/db/scope";
import { MUSCLE_GROUPS } from "@/lib/routine";
import { requireUser } from "@/lib/session";
import { addExerciseToType, copyLastSets, findExercise, findOrCreateExercise, logFinisher as finishFinisher } from "@/lib/training";

const dateSchema = z.string().regex(ISO_DATE, "Bad date");
const id = z.number().int().positive();

function revalidate() {
  revalidatePath("/train");
  revalidatePath("/today");
}

/* --------------------------------- session --------------------------------- */

/** ✓ Same as last time — one exercise, or every unlogged exercise when `exerciseId` is omitted. */
export async function sameAsLast(sessionId: number, exerciseId?: number): Promise<ActionResult<{ filled: number }>> {
  const userId = await requireUser();
  try {
    const filled = await copyLastSets(userId, id.parse(sessionId), exerciseId === undefined ? undefined : [id.parse(exerciseId)]);
    revalidate();
    return { ok: true, filled };
  } catch (e) {
    return fail(e);
  }
}

export async function discardSession(sessionId: number): Promise<ActionResult> {
  const userId = await requireUser();
  try {
    const u = forUser(userId);
    await u.db.delete(sessions).where(u.own(sessions, eq(sessions.id, id.parse(sessionId))));
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveSessionNotes(sessionId: number, notes: string): Promise<ActionResult> {
  const userId = await requireUser();
  try {
    const n = z.string().trim().max(500, "Notes too long").parse(notes);
    const u = forUser(userId);
    await u.db.update(sessions).set({ notes: n === "" ? null : n }).where(u.own(sessions, eq(sessions.id, id.parse(sessionId))));
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
  /** Reps, or seconds for holds (checked against the exercise's measure below). */
  reps: z.coerce.number().int("Whole numbers only").min(1, "At least 1").max(600, "Up to 600 seconds"),
});

export async function upsertSet(input: {
  sessionId: number;
  exerciseId: number;
  setNo: number;
  weightKg: string;
  reps: string;
}): Promise<ActionResult> {
  const userId = await requireUser();
  try {
    const v = setSchema.parse(input);
    const u = forUser(userId);
    // The session must be the user's own; a foreign id is simply not found.
    const [sess] = await u.db.select({ id: sessions.id }).from(sessions).where(u.own(sessions, eq(sessions.id, v.sessionId))).limit(1);
    if (!sess) return { ok: false, error: "Session not found" };
    const ex = await findExercise(userId, v.exerciseId);
    if (!ex) return { ok: false, error: "Exercise not found" };
    if (ex.measure === "reps" && v.reps > 100) return { ok: false, error: "1–100 reps" };
    await u.db
      .insert(sets)
      .values(u.stamp({ ...v, isWorking: true }))
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
  const userId = await requireUser();
  try {
    const u = forUser(userId);
    await u.db
      .delete(sets)
      .where(u.own(sets, eq(sets.sessionId, id.parse(sessionId)), eq(sets.exerciseId, id.parse(exerciseId)), eq(sets.setNo, z.number().int().parse(setNo))));
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** The finisher timer ran its 10 minutes (or the user marked it done): one set row + a cardio entry. */
export async function logFinisher(sessionId: number, exerciseId: number): Promise<ActionResult> {
  const userId = await requireUser();
  try {
    const ok = await finishFinisher(userId, id.parse(sessionId), id.parse(exerciseId));
    if (!ok) return { ok: false, error: "Session or exercise not found" };
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
  const userId = await requireUser();
  try {
    const sid = id.parse(sessionId);
    const v = addExerciseSchema.parse(input);
    const u = forUser(userId);

    const [sess] = await u.db.select({ typeId: sessions.routineDayId }).from(sessions).where(u.own(sessions, eq(sessions.id, sid))).limit(1);
    if (!sess) return { ok: false, error: "Session not found" };

    let exerciseId: number;
    if ("exerciseId" in v) {
      const ex = await findExercise(userId, v.exerciseId);
      if (!ex) return { ok: false, error: "Exercise not found" };
      exerciseId = ex.id;
    } else {
      exerciseId = await findOrCreateExercise(userId, v.name, v.muscleGroup);
    }

    const [{ max }] = await u.db
      .select({ max: sql<number>`coalesce(max(${sessionExercises.sortOrder}), 0)::int` })
      .from(sessionExercises)
      .where(u.own(sessionExercises, eq(sessionExercises.sessionId, sid)));
    await u.db.insert(sessionExercises).values(u.stamp({ sessionId: sid, exerciseId, sortOrder: max + 1 })).onConflictDoNothing();
    if (z.boolean().parse(alsoAddToType) && sess.typeId) await addExerciseToType(userId, sess.typeId, exerciseId);

    revalidate();
    return { ok: true, exerciseId };
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------------- cardio ---------------------------------- */

/** Add a cardio entry (validation + speed ⇄ distance derivation in normalizeCardio). */
export async function addCardio(date: string, input: CardioInput): Promise<ActionResult<{ id: number }>> {
  const userId = await requireUser();
  try {
    const e = await insertCardio(userId, dateSchema.parse(date), input);
    revalidate();
    return { ok: true, id: e.id };
  } catch (e) {
    return fail(e);
  }
}

export async function editCardio(entryId: number, input: CardioInput): Promise<ActionResult> {
  const userId = await requireUser();
  try {
    const e = await updateCardio(userId, id.parse(entryId), input);
    if (!e) return { ok: false, error: "Entry not found" };
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeCardio(entryId: number): Promise<ActionResult> {
  const userId = await requireUser();
  try {
    await deleteCardio(userId, id.parse(entryId));
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** "Same as last time": copy the most recent entry onto `date` with the current time. */
export async function repeatCardio(date: string): Promise<ActionResult> {
  const userId = await requireUser();
  try {
    const e = await repeatLastCardio(userId, dateSchema.parse(date));
    if (!e) return { ok: false, error: "No earlier cardio to repeat" };
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
