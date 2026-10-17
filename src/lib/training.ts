import { and, asc, desc, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, dailyMetrics, exercises, routineDays, routineExercises, sessionExercises, sessions, sets, type Activity } from "@/db/schema";
import { hintFromSets, loadHistory, loadLastSessionSets, stallFromHistory, type Hint, type SetLite, type Stall } from "@/lib/metrics/strength";
import { getDayState, type DayState } from "@/lib/rules/dayState";
import { typeLabel } from "@/lib/routine";

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
  /** Workout type; null = custom session. `typeName` is the display label. */
  typeId: number | null;
  typeName: string | null;
  inclineWalk: boolean;
  notes: string | null;
  exercises: ExerciseCard[];
};

export type ExerciseLite = { id: number; name: string; muscleGroup: string };

export type WorkoutType = { id: number; name: string; label: string; archived: boolean; sortOrder: number };

/** Workout types in rotation order (archived last when included). */
export async function listWorkoutTypes(opts: { includeArchived?: boolean } = {}): Promise<WorkoutType[]> {
  const rows = await db
    .select({ id: routineDays.id, name: routineDays.name, archived: routineDays.archived, sortOrder: routineDays.sortOrder })
    .from(routineDays)
    .where(opts.includeArchived ? undefined : eq(routineDays.archived, false))
    .orderBy(asc(routineDays.archived), asc(routineDays.sortOrder), asc(routineDays.id));
  return rows.map((r) => ({ ...r, label: typeLabel(r.name) }));
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
      typeId: sessions.routineDayId,
      rawTypeName: routineDays.name,
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

  const { rawTypeName, ...rest } = row;
  return {
    ...rest,
    typeName: rawTypeName ? typeLabel(rawTypeName) : null,
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
  /** Every workout type, active first (rotation order), then archived — for the day picker. */
  types: WorkoutType[];
  activities: Activity[];
  session: SessionDetail | null;
  allExercises: ExerciseLite[];
};

export async function getTrainData(date: string): Promise<TrainData> {
  const [state, types, acts, allExercises] = await Promise.all([getDayState(date), listWorkoutTypes({ includeArchived: true }), listActivities(date), listExercises()]);
  const session = state.flags.sessionId ? await getSessionDetail(state.flags.sessionId) : null;
  return { state, types, activities: acts, session, allExercises };
}

/** Exercises with ≥1 set / exercises in the session — the "2/5 logged" on Today. */
export async function sessionProgress(sessionId: number): Promise<{ logged: number; total: number }> {
  const res = await db.execute<{ logged: number; total: number }>(sql`
    select count(*)::int as total,
      count(*) filter (where exists (select 1 from sets st where st.session_id = se.session_id and st.exercise_id = se.exercise_id))::int as logged
    from session_exercises se where se.session_id = ${sessionId}`);
  return res.rows[0] ?? { logged: 0, total: 0 };
}

/* ------------------------------ shared writes ------------------------------ */

/**
 * Create a session. With a workout type, copy its exercises into session_exercises.
 * No sets are written — each exercise is logged with ✓ (same as last time, `copyLastSets`) or edited.
 * Called through `setDayPlan`.
 */
export async function createSession(date: string, routineDayId: number | null): Promise<{ sessionId: number }> {
  if (routineDayId !== null) {
    const [day] = await db.select({ id: routineDays.id }).from(routineDays).where(eq(routineDays.id, routineDayId)).limit(1);
    if (!day) throw new Error("Workout type not found");
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

export type DayChoice = { kind: "rest" } | { kind: "custom" } | { kind: "workout"; typeId: number };
export type DayPlanResult =
  | { ok: true; sessionId: number | null }
  /** The day's current session already has sets; nothing changed. Repeat with `confirm` to switch and keep them. */
  | { ok: false; needsConfirm: true; setCount: number };

/**
 * Set what a date is: a workout type, a custom session, or rest. Used by the Today/Train picker and the bot.
 * - A type/custom creates the session as Start used to (routine exercises copied, no sets). An empty session of
 *   another kind is replaced; one with sets is retyped only with `confirm` (sets kept, the new type's exercises added).
 * - Rest removes an empty session; with sets it needs `confirm`, then marks rest and keeps the session and its sets.
 */
export async function setDayPlan(date: string, choice: DayChoice, opts: { confirm?: boolean } = {}): Promise<DayPlanResult> {
  const [current] = await db
    .select({
      id: sessions.id,
      typeId: sessions.routineDayId,
      setCount: sql<number>`(select count(*) from "sets" st where st."session_id" = "sessions"."id")::int`,
    })
    .from(sessions)
    .where(eq(sessions.date, date))
    .orderBy(desc(sessions.id))
    .limit(1);
  const typeId = choice.kind === "workout" ? choice.typeId : null;
  const same = current && choice.kind !== "rest" && current.typeId === typeId;
  if (current && current.setCount > 0 && !same && !opts.confirm) return { ok: false, needsConfirm: true, setCount: current.setCount };

  if (choice.kind === "rest") {
    if (current && current.setCount === 0) await db.delete(sessions).where(eq(sessions.id, current.id));
    await db.insert(dailyMetrics).values({ date, restDay: true }).onConflictDoUpdate({ target: dailyMetrics.date, set: { restDay: true, updatedAt: new Date() } });
    return { ok: true, sessionId: null };
  }

  await db.update(dailyMetrics).set({ restDay: false, updatedAt: new Date() }).where(and(eq(dailyMetrics.date, date), eq(dailyMetrics.restDay, true)));
  if (same) return { ok: true, sessionId: current.id };
  if (!current || current.setCount === 0) {
    if (current) await db.delete(sessions).where(eq(sessions.id, current.id));
    return { ok: true, sessionId: (await createSession(date, typeId)).sessionId };
  }

  // Retype a session that has sets: keep logged exercises, drop the untouched ones, add the new type's.
  await db.update(sessions).set({ routineDayId: typeId }).where(eq(sessions.id, current.id));
  const logged = db.selectDistinct({ id: sets.exerciseId }).from(sets).where(eq(sets.sessionId, current.id));
  await db.delete(sessionExercises).where(and(eq(sessionExercises.sessionId, current.id), notInArray(sessionExercises.exerciseId, logged)));
  if (typeId !== null) {
    const re = await db
      .select({ exerciseId: routineExercises.exerciseId, sortOrder: routineExercises.sortOrder, targetSets: routineExercises.targetSets, targetReps: routineExercises.targetReps })
      .from(routineExercises)
      .where(eq(routineExercises.routineDayId, typeId));
    if (re.length) await db.insert(sessionExercises).values(re.map((x) => ({ sessionId: current.id, ...x }))).onConflictDoNothing();
  }
  return { ok: true, sessionId: current.id };
}

/** Append an exercise to a workout type's list (end of the order, 3 × 8). No-op if already there. */
export async function addExerciseToType(typeId: number, exerciseId: number): Promise<void> {
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${routineExercises.sortOrder}), 0)::int` })
    .from(routineExercises)
    .where(eq(routineExercises.routineDayId, typeId));
  await db.insert(routineExercises).values({ routineDayId: typeId, exerciseId, sortOrder: max + 1 }).onConflictDoNothing();
}

/** Reuse an exercise by name (case-insensitive) or create a custom one. */
export async function findOrCreateExercise(name: string, muscleGroup: string): Promise<number> {
  const [existing] = await db.select({ id: exercises.id }).from(exercises).where(sql`lower(${exercises.name}) = lower(${name})`).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(exercises).values({ name, muscleGroup, isCustom: true }).returning({ id: exercises.id });
  return created.id;
}
