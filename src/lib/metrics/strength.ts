/**
 * Strength metrics. Pure helpers take data; the exported per-exercise functions
 * load it. Page code should use the batch loaders + pure helpers (one query per
 * concern for every exercise) instead of calling the per-exercise functions in a loop.
 */
import { eq, sql } from "drizzle-orm";
import { exercises } from "@/db/schema";
import { addDays, isoWeekday, todayIST } from "@/lib/dates";
import { forUser, type UserId } from "@/lib/db/scope";
import { BW_RANGE } from "@/lib/routine";

/** Epley estimated 1RM, 1 dp. Bodyweight-only sets (0 kg) return 0. */
export function e1rm(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

import { MUSCLE_GROUPS } from "@/lib/routine";
export { MUSCLE_GROUPS };

const LOWER_BODY = new Set(["quads", "hamstrings", "glutes", "calves", "posterior chain"]);

/** Load increment when every target rep is hit: +5 kg lower body, +2.5 kg otherwise. */
export function loadIncrementKg(muscleGroup: string): number {
  return LOWER_BODY.has(muscleGroup.toLowerCase()) ? 5 : 2.5;
}

export type HistoryPoint = { sessionId: number; date: string; weightKg: number; reps: number; e1rm: number };
export type SetLite = { setNo: number; weightKg: number; reps: number };
export type LastSession = { sessionId: number; date: string; sets: SetLite[] };

/* --------------------------------- loaders --------------------------------- */

function idList(ids: number[]) {
  return sql.join(ids.map((id) => sql`${id}`), sql`, `);
}

/** Best working set per session (from v_e1rm_by_exercise), oldest first, per exercise. */
export async function loadHistory(userId: UserId, exerciseIds: number[], excludeSessionId?: number): Promise<Map<number, HistoryPoint[]>> {
  const out = new Map<number, HistoryPoint[]>();
  if (exerciseIds.length === 0) return out;
  const u = forUser(userId);
  const res = await u.db.execute<{ exercise_id: number; session_id: number; date: string; weight_kg: number; reps: number; e1rm: number }>(sql`
    select exercise_id, session_id, date::text as date, weight_kg::float as weight_kg, reps, e1rm::float as e1rm
    from v_e1rm_by_exercise
    where user_id = ${u.uid} and exercise_id in (${idList(exerciseIds)})
      ${excludeSessionId !== undefined ? sql`and session_id <> ${excludeSessionId}` : sql``}
    order by exercise_id, date, session_id`);
  for (const r of res.rows) {
    const list = out.get(r.exercise_id) ?? [];
    list.push({ sessionId: r.session_id, date: r.date, weightKg: r.weight_kg, reps: r.reps, e1rm: r.e1rm });
    out.set(r.exercise_id, list);
  }
  return out;
}

/** Working sets from the most recent session (any routine day) that contains each exercise. */
export async function loadLastSessionSets(userId: UserId, exerciseIds: number[], excludeSessionId?: number): Promise<Map<number, LastSession>> {
  const out = new Map<number, LastSession>();
  if (exerciseIds.length === 0) return out;
  const u = forUser(userId);
  const res = await u.db.execute<{ exercise_id: number; session_id: number; date: string; set_no: number; weight_kg: number; reps: number }>(sql`
    select exercise_id, session_id, date, set_no, weight_kg, reps from (
      select st.exercise_id, st.session_id, se.date::text as date, st.set_no, st.weight_kg::float as weight_kg, st.reps,
             dense_rank() over (partition by st.exercise_id order by se.date desc, se.id desc) as rk
      from sets st join sessions se on se.id = st.session_id
      where st.is_working and se.user_id = ${u.uid} and st.exercise_id in (${idList(exerciseIds)})
        ${excludeSessionId !== undefined ? sql`and st.session_id <> ${excludeSessionId}` : sql``}
    ) x where rk = 1
    order by exercise_id, set_no`);
  for (const r of res.rows) {
    const cur = out.get(r.exercise_id) ?? { sessionId: r.session_id, date: r.date, sets: [] };
    cur.sets.push({ setNo: r.set_no, weightKg: r.weight_kg, reps: r.reps });
    out.set(r.exercise_id, cur);
  }
  return out;
}

/** Working sets from the last `n` sessions containing each exercise, newest session first. */
export async function loadRecentSessionSets(userId: UserId, exerciseIds: number[], n = 3, excludeSessionId?: number): Promise<Map<number, SetLite[][]>> {
  const out = new Map<number, SetLite[][]>();
  if (exerciseIds.length === 0) return out;
  const u = forUser(userId);
  const res = await u.db.execute<{ exercise_id: number; rk: number; set_no: number; weight_kg: number; reps: number }>(sql`
    select exercise_id, rk, set_no, weight_kg, reps from (
      select st.exercise_id, st.set_no, st.weight_kg::float as weight_kg, st.reps,
             dense_rank() over (partition by st.exercise_id order by se.date desc, se.id desc) as rk
      from sets st join sessions se on se.id = st.session_id
      where st.is_working and se.user_id = ${u.uid} and st.exercise_id in (${idList(exerciseIds)})
        ${excludeSessionId !== undefined ? sql`and st.session_id <> ${excludeSessionId}` : sql``}
    ) x where rk <= ${n}
    order by exercise_id, rk, set_no`);
  for (const r of res.rows) {
    const sessions = out.get(r.exercise_id) ?? [];
    (sessions[r.rk - 1] ??= []).push({ setNo: r.set_no, weightKg: r.weight_kg, reps: r.reps });
    out.set(r.exercise_id, sessions);
  }
  for (const [k, v] of out) out.set(k, v.filter(Boolean));
  return out;
}

/* ------------------------------- pure helpers ------------------------------ */

export type Stall = { stalled: boolean; count: number };

/** Sessions since the last new best e1RM. Stalled when ≥ 3 consecutive sessions without a new best. */
export function stallFromHistory(history: HistoryPoint[]): Stall {
  let best = -Infinity;
  let lastPr = -1;
  history.forEach((p, i) => {
    if (p.e1rm > best) {
      best = p.e1rm;
      lastPr = i;
    }
  });
  const count = lastPr < 0 ? 0 : history.length - 1 - lastPr;
  return { stalled: count >= 3, count };
}

export type Hint = {
  text: string;
  /** Loaded lifts: first / increase / reps. Bodyweight ladders add up / down / stall (docs/home-program.md). */
  mode: "first" | "increase" | "reps" | "up" | "down" | "stall";
  suggestedWeight: number | null;
  last: { weightKg: number; reps: number[] } | null;
  /** Bodyweight only: the rung to move to next time (set with mode "up" or "down"). */
  nextRung?: { id: number; name: string } | null;
};

export type RungInfo = { ladder: string; level: number; max: number; next: { id: number; name: string } | null; prev: { id: number; name: string } | null };

/**
 * Bodyweight progression, from the last three sessions on this rung (newest first):
 * every working set at the top of the range → move up a rung; a set under the bottom two sessions running → the rung
 * below; three sessions with no rise in total reps → a slower lowering or an extra set; otherwise add to the weakest set.
 */
export function bodyweightHint(recent: SetLite[][], measure: "reps" | "seconds", targetSets: number, rung: RungInfo | null): Hint {
  const r = BW_RANGE[measure];
  const unit = measure === "seconds" ? " s" : "";
  const last = recent[0];
  if (!last || last.length === 0) {
    return { text: `First time, aim for ${targetSets} × ${r.bottom}–${r.top}${unit}`, mode: "first", suggestedWeight: null, last: null, nextRung: null };
  }
  const reps = last.map((s) => s.reps);
  const repsStr = reps.join("/");
  const lastText = measure === "seconds" ? `${repsStr} s last time` : `${last.length} × ${repsStr} last time`;
  const base = { suggestedWeight: null, last: { weightKg: 0, reps } };
  if (last.length >= targetSets && reps.every((x) => x >= r.top)) {
    return rung?.next
      ? { ...base, text: `${lastText}, move to ${rung.next.name} next time`, mode: "up", nextRung: rung.next }
      : { ...base, text: `${lastText}, top of the ladder: add a set`, mode: "up", nextRung: null };
  }
  const under = (s: SetLite[]) => s.some((x) => x.reps < r.bottom);
  if (recent.length >= 2 && under(recent[0]) && under(recent[1])) {
    return rung?.prev
      ? { ...base, text: `Two sessions under ${r.bottom}${unit}, try ${rung.prev.name} next time`, mode: "down", nextRung: rung.prev }
      : { ...base, text: `Two sessions under ${r.bottom}${unit}, drop a set and rebuild`, mode: "down", nextRung: null };
  }
  const total = (s: SetLite[]) => s.reduce((a, x) => a + x.reps, 0);
  if (recent.length >= 3 && total(recent[0]) <= total(recent[1]) && total(recent[1]) <= total(recent[2])) {
    return { ...base, text: `Three sessions at ${total(recent[0])} total${unit ? " s" : " reps"}, try a 3-second lowering or one extra set`, mode: "stall", nextRung: null };
  }
  const aim = Math.min(r.top, Math.min(...reps) + r.step);
  return { ...base, text: `${lastText}, aim for ${aim}${measure === "seconds" ? " s" : "s"}`, mode: "reps", nextRung: null };
}

/** True for exercises done with nothing but the body (and household items). */
export const isBodyweight = (equipment: string[]) => equipment.includes("none");

const fmtW = (w: number) => (w <= 0 ? "bodyweight" : Number.isInteger(w) ? `${w}` : w.toFixed(1).replace(/\.0$/, ""));

/** Progression suggestion from the previous session's working sets. */
export function hintFromSets(last: SetLite[] | null, muscleGroup: string, targetSets: number, targetReps: number): Hint {
  if (!last || last.length === 0) {
    return { text: `First time, aim for ${targetSets} × ${targetReps}`, mode: "first", suggestedWeight: null, last: null };
  }
  const weightKg = Math.max(...last.map((s) => s.weightKg));
  const reps = last.map((s) => s.reps);
  const repsStr = reps.join("/");
  const allHit = last.length >= targetSets && last.every((s) => s.reps >= targetReps);
  if (allHit) {
    if (weightKg <= 0) {
      return { text: `Last bodyweight × ${repsStr}, add reps or add load`, mode: "increase", suggestedWeight: null, last: { weightKg, reps } };
    }
    const next = weightKg + loadIncrementKg(muscleGroup);
    return { text: `Last ${fmtW(weightKg)} × ${repsStr}, try ${fmtW(next)} next`, mode: "increase", suggestedWeight: next, last: { weightKg, reps } };
  }
  return { text: `Last ${fmtW(weightKg)} × ${repsStr}, same weight, add reps`, mode: "reps", suggestedWeight: weightKg, last: { weightKg, reps } };
}

/* ------------------------- per-exercise convenience ------------------------ */

export async function bestSetPerSession(userId: UserId, exerciseId: number): Promise<HistoryPoint[]> {
  return (await loadHistory(userId, [exerciseId])).get(exerciseId) ?? [];
}

export async function stallDetector(userId: UserId, exerciseId: number): Promise<boolean> {
  return stallFromHistory(await bestSetPerSession(userId, exerciseId)).stalled;
}

export async function progressionHint(userId: UserId, exerciseId: number, targetSets: number, targetReps: number): Promise<Hint> {
  const u = forUser(userId);
  const [ex] = await u.db.select({ muscleGroup: exercises.muscleGroup }).from(exercises).where(u.visible(eq(exercises.id, exerciseId))).limit(1);
  const last = (await loadLastSessionSets(userId, [exerciseId])).get(exerciseId);
  return hintFromSets(last?.sets ?? null, ex?.muscleGroup ?? "", targetSets, targetReps);
}

export type ExerciseHistory = { exerciseId: number; name: string; muscleGroup: string; points: HistoryPoint[] };

/** Every exercise's best-set-per-session history (oldest first), for the Lifts section and checkpoints. */
export async function loadAllHistory(userId: UserId): Promise<ExerciseHistory[]> {
  const u = forUser(userId);
  const res = await u.db.execute<{ exercise_id: number; name: string; muscle_group: string; session_id: number; date: string; weight_kg: number; reps: number; e1rm: number }>(sql`
    select v.exercise_id, e.name, e.muscle_group, v.session_id, v.date::text as date, v.weight_kg::float as weight_kg, v.reps, v.e1rm::float as e1rm
    from v_e1rm_by_exercise v join exercises e on e.id = v.exercise_id
    where v.user_id = ${u.uid}
    order by e.name, v.date, v.session_id`);
  const map = new Map<number, ExerciseHistory>();
  for (const r of res.rows) {
    const h = map.get(r.exercise_id) ?? { exerciseId: r.exercise_id, name: r.name, muscleGroup: r.muscle_group, points: [] };
    h.points.push({ sessionId: r.session_id, date: r.date, weightKg: r.weight_kg, reps: r.reps, e1rm: r.e1rm });
    map.set(r.exercise_id, h);
  }
  return [...map.values()];
}

/** Indices of sessions inside a stall run (≥3 consecutive sessions without a new best). */
export function stallIndices(history: HistoryPoint[]): Set<number> {
  const out = new Set<number>();
  let best = -Infinity;
  let run: number[] = [];
  history.forEach((p, i) => {
    if (p.e1rm > best) {
      best = p.e1rm;
      run = [];
    } else {
      run.push(i);
      if (run.length >= 3) run.forEach((j) => out.add(j));
    }
  });
  return out;
}

/* ------------------------------ bodyweight log ----------------------------- */

export type BodyweightProgress = { exerciseId: number; name: string; ladder: string | null; level: number | null; max: number | null; measure: "reps" | "seconds"; best: number; sessions: number; lastDate: string };

/** Rung and best set for every bodyweight exercise the user has logged, for the Lifts section. */
export async function bodyweightProgress(userId: UserId): Promise<BodyweightProgress[]> {
  const u = forUser(userId);
  const res = await u.db.execute<{ exercise_id: number; name: string; ladder: string | null; level: number | null; max: number | null; measure: "reps" | "seconds"; best: number; sessions: number; last_date: string }>(sql`
    select e.id as exercise_id, e.name, e.ladder, e.ladder_level as level,
      (select max(x.ladder_level) from exercises x where x.ladder = e.ladder and (x.user_id is null or x.user_id = ${u.uid})) as max,
      e.measure, max(st.reps)::int as best, count(distinct st.session_id)::int as sessions, max(se.date)::text as last_date
    from sets st join sessions se on se.id = st.session_id join exercises e on e.id = st.exercise_id
    where st.is_working and se.user_id = ${u.uid} and 'none' = any(e.equipment) and e.pattern <> 'conditioning'
    group by e.id, e.name, e.ladder, e.ladder_level, e.measure
    order by e.ladder nulls last, e.ladder_level, e.name`);
  return res.rows.map((r) => ({ exerciseId: r.exercise_id, name: r.name, ladder: r.ladder, level: r.level, max: r.max, measure: r.measure, best: r.best, sessions: r.sessions, lastDate: r.last_date }));
}

/* ----------------------------- volume by muscle ---------------------------- */

export type MuscleWeek = { weekStart: string; sets: Record<string, number> };

/** Working sets per exercises.muscle_group per ISO week, for the last `weeks` weeks ending with the week of `today`. Newest first; empty weeks included. */
export async function weeklySetsByMuscle(userId: UserId, weeks = 4, today: string = todayIST()): Promise<MuscleWeek[]> {
  const u = forUser(userId);
  const currentMonday = addDays(today, -(isoWeekday(today) - 1));
  const from = addDays(currentMonday, -7 * (weeks - 1));
  const to = addDays(currentMonday, 6);
  const res = await u.db.execute<{ week_start: string; muscle_group: string; n: number }>(sql`
    select date_trunc('week', s.date)::date::text as week_start, e.muscle_group, count(*)::int as n
    from sets st
    join sessions s on s.id = st.session_id
    join exercises e on e.id = st.exercise_id
    where st.is_working and s.user_id = ${u.uid} and s.date between ${from} and ${to}
    group by 1, 2`);
  const out: MuscleWeek[] = Array.from({ length: weeks }, (_, w) => ({ weekStart: addDays(currentMonday, -7 * w), sets: {} }));
  const byWeek = new Map(out.map((w) => [w.weekStart, w]));
  for (const r of res.rows) {
    const w = byWeek.get(r.week_start);
    if (w) w.sets[r.muscle_group] = r.n;
  }
  return out;
}

/** Muscle groups for display: back first (the V-taper goal), then by set count, then name. */
export function musclesInOrder(sets: Record<string, number>): [string, number][] {
  return Object.entries(sets).sort(([a, x], [b, y]) => (a === "back" ? -1 : b === "back" ? 1 : y - x || a.localeCompare(b)));
}
