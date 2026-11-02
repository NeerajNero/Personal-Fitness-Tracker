import { and, asc, desc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { activities, dailyMetrics, exercises, routineDays, routineExercises, sessionExercises, sessions, sets, type ExerciseMeasure, type ExercisePattern } from "@/db/schema";
import { listCardio } from "@/lib/activities";
import type { CardioEntry } from "@/lib/cardio";
import { forUser, type UserId } from "@/lib/db/scope";
import { bodyweightHint, hintFromSets, isBodyweight, loadHistory, loadLastSessionSets, loadRecentSessionSets, stallFromHistory, type Hint, type RungInfo, type SetLite, type Stall } from "@/lib/metrics/strength";
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
  /** Bodyweight rows show reps (or seconds) only; conditioning rows show the finisher timer. */
  bodyweight: boolean;
  measure: ExerciseMeasure;
  pattern: ExercisePattern;
  rung: { ladder: string; level: number; max: number } | null;
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

export type ExerciseLite = { id: number; name: string; muscleGroup: string; equipment: string[]; measure: ExerciseMeasure; pattern: ExercisePattern; ladder: string | null; ladderLevel: number | null };

const liteCols = { id: exercises.id, name: exercises.name, muscleGroup: exercises.muscleGroup, equipment: exercises.equipment, measure: exercises.measure, pattern: exercises.pattern, ladder: exercises.ladder, ladderLevel: exercises.ladderLevel };

/** Every rung of the given ladders visible to the user, by ladder, easiest first. */
export async function loadLadders(userId: UserId, ladders: string[]): Promise<Map<string, { id: number; name: string; level: number }[]>> {
  const out = new Map<string, { id: number; name: string; level: number }[]>();
  const keys = [...new Set(ladders)];
  if (keys.length === 0) return out;
  const u = forUser(userId);
  const rows = await u.db
    .select({ id: exercises.id, name: exercises.name, ladder: exercises.ladder, level: exercises.ladderLevel })
    .from(exercises)
    .where(u.visible(inArray(exercises.ladder, keys), isNotNull(exercises.ladderLevel)))
    .orderBy(asc(exercises.ladder), asc(exercises.ladderLevel));
  for (const r of rows) {
    const list = out.get(r.ladder!) ?? [];
    list.push({ id: r.id, name: r.name, level: r.level! });
    out.set(r.ladder!, list);
  }
  return out;
}

export function rungInfo(ladders: Map<string, { id: number; name: string; level: number }[]>, ladder: string | null, level: number | null): RungInfo | null {
  if (!ladder || level === null) return null;
  const rungs = ladders.get(ladder) ?? [];
  const i = rungs.findIndex((r) => r.level === level);
  const pick = (j: number) => (rungs[j] ? { id: rungs[j].id, name: rungs[j].name } : null);
  return { ladder, level, max: rungs.length, next: i >= 0 ? pick(i + 1) : null, prev: i > 0 ? pick(i - 1) : null };
}

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

/** The shared library plus the user's custom exercises; ladder siblings sit together, easiest first. */
export function listExercises(userId: UserId): Promise<ExerciseLite[]> {
  const u = forUser(userId);
  return u.db.select(liteCols).from(exercises).where(u.visible()).orderBy(sql`${exercises.ladder} nulls last`, asc(exercises.ladderLevel), asc(exercises.name));
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
      equipment: exercises.equipment,
      measure: exercises.measure,
      pattern: exercises.pattern,
      ladder: exercises.ladder,
      ladderLevel: exercises.ladderLevel,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(u.own(routineExercises))
    .orderBy(asc(routineExercises.routineDayId), asc(routineExercises.sortOrder));
}

/** Rung count per ladder the user can see (for "rung 2 of 6" in Settings). */
export async function ladderSizes(userId: UserId): Promise<Map<string, number>> {
  const u = forUser(userId);
  const rows = await u.db
    .select({ ladder: exercises.ladder, n: sql<number>`count(*)::int` })
    .from(exercises)
    .where(u.visible(isNotNull(exercises.ladder)))
    .groupBy(exercises.ladder);
  return new Map(rows.map((r) => [r.ladder!, r.n]));
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
        equipment: exercises.equipment,
        measure: exercises.measure,
        pattern: exercises.pattern,
        ladder: exercises.ladder,
        ladderLevel: exercises.ladderLevel,
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
  const bwIds = exRows.filter((e) => isBodyweight(e.equipment)).map((e) => e.exerciseId);
  const [history, lastSets, recent, ladders] = await Promise.all([
    loadHistory(userId, ids, sessionId),
    loadLastSessionSets(userId, ids, sessionId),
    loadRecentSessionSets(userId, bwIds, 3, sessionId),
    loadLadders(userId, exRows.flatMap((e) => (e.ladder ? [e.ladder] : []))),
  ]);

  const { rawTypeName, ...rest } = row;
  return {
    ...rest,
    typeName: rawTypeName ? typeLabel(rawTypeName) : null,
    exercises: exRows.map(({ equipment, ladder, ladderLevel, ...e }) => {
      const bodyweight = isBodyweight(equipment);
      const rung = rungInfo(ladders, ladder, ladderLevel);
      return {
        ...e,
        bodyweight,
        rung: rung ? { ladder: rung.ladder, level: rung.level, max: rung.max } : null,
        sets: setRows.filter((s) => s.exerciseId === e.exerciseId).map(({ setNo, weightKg, reps }) => ({ setNo, weightKg, reps })),
        hint: bodyweight
          ? bodyweightHint(recent.get(e.exerciseId) ?? [], e.measure, e.targetSets, rung)
          : hintFromSets(lastSets.get(e.exerciseId)?.sets ?? null, e.muscleGroup, e.targetSets, e.targetReps),
        stall: bodyweight ? { stalled: false, count: 0 } : stallFromHistory(history.get(e.exerciseId) ?? []),
      };
    }),
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
 * Ladder rungs whose last session had every set at the top of the range move up one rung in the type's list, so the
 * next session starts on the new rung (docs/home-program.md). Earlier sessions keep the old rung. Returns what moved.
 */
export async function advanceLadders(userId: UserId, routineDayId: number): Promise<{ from: string; to: string }[]> {
  const u = forUser(userId);
  const rows = await u.db
    .select({ exerciseId: routineExercises.exerciseId, name: exercises.name, targetSets: routineExercises.targetSets, equipment: exercises.equipment, measure: exercises.measure, ladder: exercises.ladder, level: exercises.ladderLevel })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(u.own(routineExercises, eq(routineExercises.routineDayId, routineDayId), isNotNull(exercises.ladder)));
  const bw = rows.filter((r) => isBodyweight(r.equipment));
  if (bw.length === 0) return [];
  const [recent, ladders] = await Promise.all([loadRecentSessionSets(userId, bw.map((r) => r.exerciseId), 3), loadLadders(userId, bw.map((r) => r.ladder!))]);
  const inType = new Set(rows.map((r) => r.exerciseId));
  const moved: { from: string; to: string }[] = [];
  for (const r of bw) {
    const hint = bodyweightHint(recent.get(r.exerciseId) ?? [], r.measure, r.targetSets, rungInfo(ladders, r.ladder, r.level));
    if (hint.mode !== "up" || !hint.nextRung || inType.has(hint.nextRung.id)) continue;
    await u.db.update(routineExercises).set({ exerciseId: hint.nextRung.id }).where(u.own(routineExercises, eq(routineExercises.routineDayId, routineDayId), eq(routineExercises.exerciseId, r.exerciseId)));
    inType.add(hint.nextRung.id);
    moved.push({ from: r.name, to: hint.nextRung.name });
  }
  return moved;
}

/**
 * Create a session. With a workout type, advance any ladder rung that earned it, then copy the type's exercises into
 * session_exercises. No sets are written — each exercise is logged with ✓ (same as last time, `copyLastSets`) or edited.
 * Called through `setDayPlan`.
 */
export async function createSession(userId: UserId, date: string, routineDayId: number | null): Promise<{ sessionId: number }> {
  const u = forUser(userId);
  if (routineDayId !== null) {
    const [day] = await u.db.select({ id: routineDays.id }).from(routineDays).where(u.own(routineDays, eq(routineDays.id, routineDayId))).limit(1);
    if (!day) throw new Error("Workout type not found");
    await advanceLadders(userId, routineDayId);
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

/** Settings: move a ladder exercise in a type to the rung above or below (no-op at the ends or when that rung is already in the type). */
export async function setRoutineRung(userId: UserId, typeId: number, exerciseId: number, dir: "up" | "down"): Promise<{ name: string } | null> {
  const u = forUser(userId);
  const [row] = await u.db.select({ ladder: exercises.ladder, level: exercises.ladderLevel }).from(exercises).where(u.visible(eq(exercises.id, exerciseId))).limit(1);
  if (!row?.ladder || row.level === null) return null;
  const info = rungInfo(await loadLadders(userId, [row.ladder]), row.ladder, row.level);
  const target = dir === "up" ? info?.next : info?.prev;
  if (!target) return null;
  const [taken] = await u.db.select({ id: routineExercises.exerciseId }).from(routineExercises).where(u.own(routineExercises, eq(routineExercises.routineDayId, typeId), eq(routineExercises.exerciseId, target.id))).limit(1);
  if (taken) return null;
  await u.db.update(routineExercises).set({ exerciseId: target.id }).where(u.own(routineExercises, eq(routineExercises.routineDayId, typeId), eq(routineExercises.exerciseId, exerciseId)));
  return { name: target.name };
}

/** The finisher's 10 minutes are done: one set row (so the exercise counts as logged) and a cardio entry. */
export async function logFinisher(userId: UserId, sessionId: number, exerciseId: number, minutes = 10): Promise<boolean> {
  const u = forUser(userId);
  const [sess] = await u.db.select({ date: sessions.date }).from(sessions).where(u.own(sessions, eq(sessions.id, sessionId))).limit(1);
  const [ex] = await u.db.select({ name: exercises.name }).from(exercises).where(u.visible(eq(exercises.id, exerciseId))).limit(1);
  if (!sess || !ex) return false;
  await u.db.insert(sets).values(u.stamp({ sessionId, exerciseId, setNo: 1, weightKg: 0, reps: minutes, isWorking: true })).onConflictDoNothing();
  await u.db.insert(activities).values(u.stamp({ date: sess.date, type: "sport", name: `${ex.name}, 30/30 intervals`, minutes, effort: "hard", loggedAt: new Date() }));
  return true;
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
  const [row] = await u.db.select(liteCols).from(exercises).where(u.visible(eq(exercises.id, exerciseId))).limit(1);
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
