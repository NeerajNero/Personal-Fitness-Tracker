import { and, asc, desc, eq, notInArray, sql } from "drizzle-orm";
import { dailyMetrics, exercises, routineDays, routineExercises, sessionExercises, sessions, sets } from "@/db/schema";
import { listCardio } from "@/lib/activities";
import type { CardioEntry } from "@/lib/cardio";
import { forUser, type UserId } from "@/lib/db/scope";
import { hintFromSets, loadHistory, loadLastSessionSets, stallFromHistory, type Hint, type SetLite, type Stall } from "@/lib/metrics/strength";
import { getDayState, type DayState } from "@/lib/rules/dayState";
import { typeLabel } from "@/lib/routine";

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
export async function listWorkoutTypes(userId: UserId, opts: { includeArchived?: boolean } = {}): Promise<WorkoutType[]> {
  const u = forUser(userId);
  const rows = await u.db
    .select({ id: routineDays.id, name: routineDays.name, archived: routineDays.archived, sortOrder: routineDays.sortOrder })
    .from(routineDays)
    .where(u.own(routineDays, opts.includeArchived ? undefined : eq(routineDays.archived, false)))
    .orderBy(asc(routineDays.archived), asc(routineDays.sortOrder), asc(routineDays.id));
  return rows.map((r) => ({ ...r, label: typeLabel(r.name) }));
}

/** The shared library plus the user's custom exercises. */
export function listExercises(userId: UserId): Promise<ExerciseLite[]> {
  const u = forUser(userId);
  return u.db.select({ id: exercises.id, name: exercises.name, muscleGroup: exercises.muscleGroup }).from(exercises).where(u.visible()).orderBy(asc(exercises.name));
}

export function listRoutineExerciseNames(userId: UserId, routineDayId: number): Promise<{ name: string }[]> {
  const u = forUser(userId);
  return u.db
    .select({ name: exercises.name })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(u.own(routineExercises, eq(routineExercises.routineDayId, routineDayId)))
    .orderBy(asc(routineExercises.sortOrder));
}

/** A workout type's list with exercise details, for Settings. */
export function listRoutineExercises(userId: UserId) {
  const u = forUser(userId);
  return u.db
    .select({
      routineDayId: routineExercises.routineDayId,
      exerciseId: routineExercises.exerciseId,
      sortOrder: routineExercises.sortOrder,
      targetSets: routineExercises.targetSets,
      targetReps: routineExercises.targetReps,
      name: exercises.name,
      muscleGroup: exercises.muscleGroup,
      cues: exercises.cues,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(u.own(routineExercises))
    .orderBy(asc(routineExercises.routineDayId), asc(routineExercises.sortOrder));
}

export async function getSessionDetail(userId: UserId, sessionId: number): Promise<SessionDetail | null> {
  const u = forUser(userId);
  const [row] = await u.db
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
    .where(u.own(sessions, eq(sessions.id, sessionId)))
    .limit(1);
  if (!row) return null;

  const [exRows, setRows] = await Promise.all([
    u.db
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
      .where(u.own(sessionExercises, eq(sessionExercises.sessionId, sessionId)))
      .orderBy(asc(sessionExercises.sortOrder)),
    u.db
      .select({ exerciseId: sets.exerciseId, setNo: sets.setNo, weightKg: sets.weightKg, reps: sets.reps })
      .from(sets)
      .where(u.own(sets, eq(sets.sessionId, sessionId)))
      .orderBy(asc(sets.exerciseId), asc(sets.setNo)),
  ]);

  const ids = exRows.map((e) => e.exerciseId);
  const [history, lastSets] = await Promise.all([loadHistory(userId, ids, sessionId), loadLastSessionSets(userId, ids, sessionId)]);

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
  /** The date's cardio entries, oldest first. The repeat candidate is `state.cardio.lastEntry`. */
  cardio: CardioEntry[];
  session: SessionDetail | null;
  allExercises: ExerciseLite[];
};

export async function getTrainData(userId: UserId, date: string): Promise<TrainData> {
  const [state, types, cardio, allExercises] = await Promise.all([
    getDayState(userId, date),
    listWorkoutTypes(userId, { includeArchived: true }),
    listCardio(userId, date),
    listExercises(userId),
  ]);
  const session = state.flags.sessionId ? await getSessionDetail(userId, state.flags.sessionId) : null;
  return { state, types, cardio, session, allExercises };
}

/** Exercises with ≥1 set / exercises in the session — the "2/5 logged" on Today. */
export async function sessionProgress(userId: UserId, sessionId: number): Promise<{ logged: number; total: number }> {
  const u = forUser(userId);
  const res = await u.db.execute<{ logged: number; total: number }>(sql`
    select count(*)::int as total,
      count(*) filter (where exists (select 1 from sets st where st.session_id = se.session_id and st.exercise_id = se.exercise_id))::int as logged
    from session_exercises se where se.session_id = ${sessionId} and se.user_id = ${u.uid}`);
  return res.rows[0] ?? { logged: 0, total: 0 };
}

/* ------------------------------ shared writes ------------------------------ */

/**
 * Create a session. With a workout type, copy its exercises into session_exercises.
 * No sets are written — each exercise is logged with ✓ (same as last time, `copyLastSets`) or edited.
 * Called through `setDayPlan`.
 */
export async function createSession(userId: UserId, date: string, routineDayId: number | null): Promise<{ sessionId: number }> {
  const u = forUser(userId);
  if (routineDayId !== null) {
    const [day] = await u.db.select({ id: routineDays.id }).from(routineDays).where(u.own(routineDays, eq(routineDays.id, routineDayId))).limit(1);
    if (!day) throw new Error("Workout type not found");
  }
  const [sess] = await u.db.insert(sessions).values(u.stamp({ date, routineDayId })).returning({ id: sessions.id });

  if (routineDayId !== null) {
    const re = await u.db
      .select({
        exerciseId: routineExercises.exerciseId,
        sortOrder: routineExercises.sortOrder,
        targetSets: routineExercises.targetSets,
        targetReps: routineExercises.targetReps,
      })
      .from(routineExercises)
      .where(u.own(routineExercises, eq(routineExercises.routineDayId, routineDayId)))
      .orderBy(asc(routineExercises.sortOrder));
    if (re.length) await u.db.insert(sessionExercises).values(re.map((x) => u.stamp({ sessionId: sess.id, ...x })));
  }
  return { sessionId: sess.id };
}

/**
 * "Same as last time": copy each exercise's previous working sets into this session.
 * Exercises that already have sets here are left alone. `exerciseIds` omitted = every exercise in the session.
 * Returns how many exercises were filled.
 */
export async function copyLastSets(userId: UserId, sessionId: number, exerciseIds?: number[]): Promise<number> {
  const u = forUser(userId);
  const [inSession, logged] = await Promise.all([
    u.db.select({ id: sessionExercises.exerciseId }).from(sessionExercises).where(u.own(sessionExercises, eq(sessionExercises.sessionId, sessionId))),
    u.db.selectDistinct({ id: sets.exerciseId }).from(sets).where(u.own(sets, eq(sets.sessionId, sessionId))),
  ]);
  const done = new Set(logged.map((x) => x.id));
  const wanted = exerciseIds ? new Set(exerciseIds) : null;
  const ids = inSession.map((x) => x.id).filter((id) => !done.has(id) && (wanted === null || wanted.has(id)));
  if (ids.length === 0) return 0;

  const last = await loadLastSessionSets(userId, ids, sessionId);
  const copies = [...last.entries()].flatMap(([exerciseId, l]) =>
    l.sets.map((s) => u.stamp({ sessionId, exerciseId, setNo: s.setNo, weightKg: s.weightKg, reps: s.reps, isWorking: true })),
  );
  if (copies.length) await u.db.insert(sets).values(copies).onConflictDoNothing();
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
export async function setDayPlan(userId: UserId, date: string, choice: DayChoice, opts: { confirm?: boolean } = {}): Promise<DayPlanResult> {
  const u = forUser(userId);
  const [current] = await u.db
    .select({
      id: sessions.id,
      typeId: sessions.routineDayId,
      setCount: sql<number>`(select count(*) from "sets" st where st."session_id" = "sessions"."id")::int`,
    })
    .from(sessions)
    .where(u.own(sessions, eq(sessions.date, date)))
    .orderBy(desc(sessions.id))
    .limit(1);
  const typeId = choice.kind === "workout" ? choice.typeId : null;
  const same = current && choice.kind !== "rest" && current.typeId === typeId;
  if (current && current.setCount > 0 && !same && !opts.confirm) return { ok: false, needsConfirm: true, setCount: current.setCount };

  if (choice.kind === "rest") {
    if (current && current.setCount === 0) await u.db.delete(sessions).where(u.own(sessions, eq(sessions.id, current.id)));
    await u.db
      .insert(dailyMetrics)
      .values(u.stamp({ date, restDay: true }))
      .onConflictDoUpdate({ target: [dailyMetrics.userId, dailyMetrics.date], set: { restDay: true, updatedAt: new Date() } });
    return { ok: true, sessionId: null };
  }

  await u.db.update(dailyMetrics).set({ restDay: false, updatedAt: new Date() }).where(u.own(dailyMetrics, eq(dailyMetrics.date, date), eq(dailyMetrics.restDay, true)));
  if (same) return { ok: true, sessionId: current.id };
  if (!current || current.setCount === 0) {
    if (current) await u.db.delete(sessions).where(u.own(sessions, eq(sessions.id, current.id)));
    return { ok: true, sessionId: (await createSession(userId, date, typeId)).sessionId };
  }

  // Retype a session that has sets: keep logged exercises, drop the untouched ones, add the new type's.
  await u.db.update(sessions).set({ routineDayId: typeId }).where(u.own(sessions, eq(sessions.id, current.id)));
  const logged = u.db.selectDistinct({ id: sets.exerciseId }).from(sets).where(u.own(sets, eq(sets.sessionId, current.id)));
  await u.db.delete(sessionExercises).where(and(u.own(sessionExercises, eq(sessionExercises.sessionId, current.id)), notInArray(sessionExercises.exerciseId, logged)));
  if (typeId !== null) {
    const re = await u.db
      .select({ exerciseId: routineExercises.exerciseId, sortOrder: routineExercises.sortOrder, targetSets: routineExercises.targetSets, targetReps: routineExercises.targetReps })
      .from(routineExercises)
      .where(u.own(routineExercises, eq(routineExercises.routineDayId, typeId)));
    if (re.length) await u.db.insert(sessionExercises).values(re.map((x) => u.stamp({ sessionId: current.id, ...x }))).onConflictDoNothing();
  }
  return { ok: true, sessionId: current.id };
}

/** Append an exercise to a workout type's list (end of the order, 3 × 8). No-op if already there. */
export async function addExerciseToType(userId: UserId, typeId: number, exerciseId: number): Promise<void> {
  const u = forUser(userId);
  const [{ max }] = await u.db
    .select({ max: sql<number>`coalesce(max(${routineExercises.sortOrder}), 0)::int` })
    .from(routineExercises)
    .where(u.own(routineExercises, eq(routineExercises.routineDayId, typeId)));
  await u.db.insert(routineExercises).values(u.stamp({ routineDayId: typeId, exerciseId, sortOrder: max + 1 })).onConflictDoNothing();
}

/** Reuse a visible exercise by name (case-insensitive) or create a custom one for this user. */
export async function findOrCreateExercise(userId: UserId, name: string, muscleGroup: string): Promise<number> {
  const u = forUser(userId);
  const [existing] = await u.db.select({ id: exercises.id }).from(exercises).where(u.visible(sql`lower(${exercises.name}) = lower(${name})`)).limit(1);
  if (existing) return existing.id;
  const [created] = await u.db.insert(exercises).values(u.stamp({ name, muscleGroup, isCustom: true })).returning({ id: exercises.id });
  return created.id;
}

/** A library or own exercise by id, or null when it isn't visible to this user. */
export async function findExercise(userId: UserId, exerciseId: number): Promise<ExerciseLite | null> {
  const u = forUser(userId);
  const [row] = await u.db.select({ id: exercises.id, name: exercises.name, muscleGroup: exercises.muscleGroup }).from(exercises).where(u.visible(eq(exercises.id, exerciseId))).limit(1);
  return row ?? null;
}

/**
 * Create a workout type with its exercises (by library name). Used by onboarding for gym users.
 * Names that aren't in the library are skipped. Does nothing when the type already exists.
 */
export async function createWorkoutType(userId: UserId, name: string, sortOrder: number, exerciseNames: string[]): Promise<number | null> {
  const u = forUser(userId);
  const [created] = await u.db.insert(routineDays).values(u.stamp({ name, sortOrder })).onConflictDoNothing().returning({ id: routineDays.id });
  if (!created) return null;
  const lib = await u.db.select({ id: exercises.id, name: exercises.name }).from(exercises).where(u.visible());
  const byName = new Map(lib.map((e) => [e.name.toLowerCase(), e.id]));
  const values = exerciseNames.flatMap((n, i) => {
    const exerciseId = byName.get(n.toLowerCase());
    return exerciseId === undefined ? [] : [u.stamp({ routineDayId: created.id, exerciseId, sortOrder: i + 1, targetSets: 3, targetReps: 8 })];
  });
  if (values.length) await u.db.insert(routineExercises).values(values).onConflictDoNothing();
  return created.id;
}
