import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, exercises, routineDays, routineExercises, sessionExercises, sessions, sets, type Activity } from "@/db/schema";
import { hintFromSets, loadHistory, loadLastSessionSets, stallFromHistory, type Hint, type SetLite, type Stall } from "@/lib/metrics/strength";
import { getDayState, type DayState, type RoutineDayName } from "@/lib/rules/dayState";

export type { Activity };

export type ExerciseCard = {
  exerciseId: number;
  name: string;
  muscleGroup: string;
  cues: string | null;
  targetSets: number;
  targetReps: number;
  sets: SetLite[];
  hint: Hint;
  stall: Stall;
};

export type SessionDetail = {
  id: number;
  date: string;
  routineDayId: number | null;
  routineDayName: RoutineDayName | null;
  inclineWalk: boolean;
  notes: string | null;
  exercises: ExerciseCard[];
};

export type ExerciseLite = { id: number; name: string; muscleGroup: string };

export function listRoutineDays() {
  return db.select({ id: routineDays.id, name: routineDays.name, weekday: routineDays.weekday }).from(routineDays).orderBy(asc(routineDays.sortOrder));
}

export function listExercises(): Promise<ExerciseLite[]> {
  return db.select({ id: exercises.id, name: exercises.name, muscleGroup: exercises.muscleGroup }).from(exercises).orderBy(asc(exercises.name));
}

export function listActivities(date: string): Promise<Activity[]> {
  return db.select().from(activities).where(eq(activities.date, date)).orderBy(asc(activities.id));
}

export function listRoutineExerciseNames(routineDayId: number): Promise<{ name: string }[]> {
  return db
    .select({ name: exercises.name })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(eq(routineExercises.routineDayId, routineDayId))
    .orderBy(asc(routineExercises.sortOrder));
}

export async function getSessionDetail(sessionId: number): Promise<SessionDetail | null> {
  const [row] = await db
    .select({
      id: sessions.id,
      date: sessions.date,
      routineDayId: sessions.routineDayId,
      routineDayName: routineDays.name,
      inclineWalk: sessions.inclineWalk,
      notes: sessions.notes,
    })
    .from(sessions)
    .leftJoin(routineDays, eq(routineDays.id, sessions.routineDayId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) return null;

  const [exRows, setRows] = await Promise.all([
    db
      .select({
        exerciseId: sessionExercises.exerciseId,
        name: exercises.name,
        muscleGroup: exercises.muscleGroup,
        cues: exercises.cues,
        targetSets: sessionExercises.targetSets,
        targetReps: sessionExercises.targetReps,
      })
      .from(sessionExercises)
      .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
      .where(eq(sessionExercises.sessionId, sessionId))
      .orderBy(asc(sessionExercises.sortOrder)),
    db
      .select({ exerciseId: sets.exerciseId, setNo: sets.setNo, weightKg: sets.weightKg, reps: sets.reps })
      .from(sets)
      .where(eq(sets.sessionId, sessionId))
      .orderBy(asc(sets.exerciseId), asc(sets.setNo)),
  ]);

  const ids = exRows.map((e) => e.exerciseId);
  const [history, lastSets] = await Promise.all([loadHistory(ids, sessionId), loadLastSessionSets(ids, sessionId)]);

  return {
    ...row,
    exercises: exRows.map((e) => ({
      ...e,
      sets: setRows.filter((s) => s.exerciseId === e.exerciseId).map(({ setNo, weightKg, reps }) => ({ setNo, weightKg, reps })),
      hint: hintFromSets(lastSets.get(e.exerciseId)?.sets ?? null, e.muscleGroup, e.targetSets, e.targetReps),
      stall: stallFromHistory(history.get(e.exerciseId) ?? []),
    })),
  };
}

export type TrainData = {
  state: DayState;
  routineDays: { id: number; name: RoutineDayName; weekday: number }[];
  activities: Activity[];
  session: SessionDetail | null;
  /** Exercise names of the day's routine, for the pre-start preview. */
  preview: string[];
  allExercises: ExerciseLite[];
};

export async function getTrainData(date: string): Promise<TrainData> {
  const [state, days, acts, allExercises] = await Promise.all([getDayState(date), listRoutineDays(), listActivities(date), listExercises()]);
  const [session, preview] = await Promise.all([
    state.flags.sessionId ? getSessionDetail(state.flags.sessionId) : Promise.resolve(null),
    state.flags.routineDayId && !state.flags.sessionId
      ? listRoutineExerciseNames(state.flags.routineDayId).then((r) => r.map((x) => x.name))
      : Promise.resolve([] as string[]),
  ]);
  return { state, routineDays: days, activities: acts, session, preview, allExercises };
}

/* ------------------------------ shared writes ------------------------------ */

/**
 * Create a session. With a routine day, copy its exercises into session_exercises.
 * No sets are written — each exercise is logged with ✓ (same as last time, `copyLastSets`) or edited.
 * Used by the Train screen's Start and the bot's `done`.
 */
export async function createSession(date: string, routineDayId: number | null): Promise<{ sessionId: number }> {
  if (routineDayId !== null) {
    const [day] = await db.select({ id: routineDays.id }).from(routineDays).where(eq(routineDays.id, routineDayId)).limit(1);
    if (!day) throw new Error("Routine day not found");
  }
  const [sess] = await db.insert(sessions).values({ date, routineDayId }).returning({ id: sessions.id });

  if (routineDayId !== null) {
    const re = await db
      .select({
        exerciseId: routineExercises.exerciseId,
        sortOrder: routineExercises.sortOrder,
        targetSets: routineExercises.targetSets,
        targetReps: routineExercises.targetReps,
      })
      .from(routineExercises)
      .where(eq(routineExercises.routineDayId, routineDayId))
      .orderBy(asc(routineExercises.sortOrder));
    if (re.length) await db.insert(sessionExercises).values(re.map((x) => ({ sessionId: sess.id, ...x })));
  }
  return { sessionId: sess.id };
}

/**
 * "Same as last time": copy each exercise's previous working sets into this session.
 * Exercises that already have sets here are left alone. `exerciseIds` omitted = every exercise in the session.
 * Returns how many exercises were filled.
 */
export async function copyLastSets(sessionId: number, exerciseIds?: number[]): Promise<number> {
  const [inSession, logged] = await Promise.all([
    db.select({ id: sessionExercises.exerciseId }).from(sessionExercises).where(eq(sessionExercises.sessionId, sessionId)),
    db.selectDistinct({ id: sets.exerciseId }).from(sets).where(eq(sets.sessionId, sessionId)),
  ]);
  const done = new Set(logged.map((x) => x.id));
  const wanted = exerciseIds ? new Set(exerciseIds) : null;
  const ids = inSession.map((x) => x.id).filter((id) => !done.has(id) && (wanted === null || wanted.has(id)));
  if (ids.length === 0) return 0;

  const last = await loadLastSessionSets(ids, sessionId);
  const copies = [...last.entries()].flatMap(([exerciseId, l]) =>
    l.sets.map((s) => ({ sessionId, exerciseId, setNo: s.setNo, weightKg: s.weightKg, reps: s.reps, isWorking: true })),
  );
  if (copies.length) await db.insert(sets).values(copies).onConflictDoNothing();
  return last.size;
}

/** Reuse an exercise by name (case-insensitive) or create a custom one. */
export async function findOrCreateExercise(name: string, muscleGroup: string): Promise<number> {
  const [existing] = await db.select({ id: exercises.id }).from(exercises).where(sql`lower(${exercises.name}) = lower(${name})`).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(exercises).values({ name, muscleGroup, isCustom: true }).returning({ id: exercises.id });
  return created.id;
}
