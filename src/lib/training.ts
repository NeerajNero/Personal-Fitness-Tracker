import { asc, eq } from "drizzle-orm";
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
 * Create a session. With a routine day: copy its exercises into session_exercises and
 * materialise each exercise's last working sets as real rows (edit only what changed).
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
    if (re.length) {
      await db.insert(sessionExercises).values(re.map((x) => ({ sessionId: sess.id, ...x })));
      const last = await loadLastSessionSets(re.map((x) => x.exerciseId), sess.id);
      const copies = [...last.entries()].flatMap(([exerciseId, l]) =>
        l.sets.map((s) => ({ sessionId: sess.id, exerciseId, setNo: s.setNo, weightKg: s.weightKg, reps: s.reps, isWorking: true })),
      );
      if (copies.length) await db.insert(sets).values(copies);
    }
  }
  return { sessionId: sess.id };
}
