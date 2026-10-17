/**
 * Strength metrics. Pure helpers take data; the exported per-exercise functions
 * load it. Page code should use the batch loaders + pure helpers (one query per
 * concern for every exercise) instead of calling the per-exercise functions in a loop.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { exercises } from "@/db/schema";
import { addDays, isoWeekday, todayIST } from "@/lib/dates";

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
export async function loadHistory(exerciseIds: number[], excludeSessionId?: number): Promise<Map<number, HistoryPoint[]>> {
  const out = new Map<number, HistoryPoint[]>();
  if (exerciseIds.length === 0) return out;
  const res = await db.execute<{ exercise_id: number; session_id: number; date: string; weight_kg: number; reps: number; e1rm: number }>(sql`
    select exercise_id, session_id, date::text as date, weight_kg::float as weight_kg, reps, e1rm::float as e1rm
    from v_e1rm_by_exercise
    where exercise_id in (${idList(exerciseIds)})
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
export async function loadLastSessionSets(exerciseIds: number[], excludeSessionId?: number): Promise<Map<number, LastSession>> {
  const out = new Map<number, LastSession>();
  if (exerciseIds.length === 0) return out;
  const res = await db.execute<{ exercise_id: number; session_id: number; date: string; set_no: number; weight_kg: number; reps: number }>(sql`
    select exercise_id, session_id, date, set_no, weight_kg, reps from (
      select st.exercise_id, st.session_id, se.date::text as date, st.set_no, st.weight_kg::float as weight_kg, st.reps,
             dense_rank() over (partition by st.exercise_id order by se.date desc, se.id desc) as rk
      from sets st join sessions se on se.id = st.session_id
      where st.is_working and st.exercise_id in (${idList(exerciseIds)})
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
  mode: "first" | "increase" | "reps";
  suggestedWeight: number | null;
  last: { weightKg: number; reps: number[] } | null;
};

const fmtW = (w: number) => (w <= 0 ? "BW" : Number.isInteger(w) ? `${w}` : w.toFixed(1).replace(/\.0$/, ""));

/** Progression suggestion from the previous session's working sets. */
export function hintFromSets(last: SetLite[] | null, muscleGroup: string, targetSets: number, targetReps: number): Hint {
  if (!last || last.length === 0) {
    return { text: `first time — aim for ${targetSets} × ${targetReps}`, mode: "first", suggestedWeight: null, last: null };
  }
  const weightKg = Math.max(...last.map((s) => s.weightKg));
  const reps = last.map((s) => s.reps);
  const repsStr = reps.join("/");
  const allHit = last.length >= targetSets && last.every((s) => s.reps >= targetReps);
  if (allHit) {
    if (weightKg <= 0) {
      return { text: `last BW × ${repsStr} → add reps or add load`, mode: "increase", suggestedWeight: null, last: { weightKg, reps } };
    }
    const next = weightKg + loadIncrementKg(muscleGroup);
    return { text: `last ${fmtW(weightKg)} × ${repsStr} → try ${fmtW(next)}`, mode: "increase", suggestedWeight: next, last: { weightKg, reps } };
  }
  return { text: `last ${fmtW(weightKg)} × ${repsStr} → same weight, add reps`, mode: "reps", suggestedWeight: weightKg, last: { weightKg, reps } };
}

/* ------------------------- per-exercise convenience ------------------------ */

export async function bestSetPerSession(exerciseId: number): Promise<HistoryPoint[]> {
  return (await loadHistory([exerciseId])).get(exerciseId) ?? [];
}

export async function stallDetector(exerciseId: number): Promise<boolean> {
  return stallFromHistory(await bestSetPerSession(exerciseId)).stalled;
}

export async function progressionHint(exerciseId: number, targetSets: number, targetReps: number): Promise<Hint> {
  const [ex] = await db.select({ muscleGroup: exercises.muscleGroup }).from(exercises).where(eq(exercises.id, exerciseId)).limit(1);
  const last = (await loadLastSessionSets([exerciseId])).get(exerciseId);
  return hintFromSets(last?.sets ?? null, ex?.muscleGroup ?? "", targetSets, targetReps);
}

export type ExerciseHistory = { exerciseId: number; name: string; muscleGroup: string; points: HistoryPoint[] };

/** Every exercise's best-set-per-session history (oldest first), for the Lifts section and checkpoints. */
export async function loadAllHistory(): Promise<ExerciseHistory[]> {
  const res = await db.execute<{ exercise_id: number; name: string; muscle_group: string; session_id: number; date: string; weight_kg: number; reps: number; e1rm: number }>(sql`
    select v.exercise_id, e.name, e.muscle_group, v.session_id, v.date::text as date, v.weight_kg::float as weight_kg, v.reps, v.e1rm::float as e1rm
    from v_e1rm_by_exercise v join exercises e on e.id = v.exercise_id
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

/* ----------------------------- volume by muscle ---------------------------- */

export type MuscleWeek = { weekStart: string; sets: Record<string, number> };

/** Working sets per exercises.muscle_group per ISO week, for the last `weeks` weeks ending with the week of `today`. Newest first; empty weeks included. */
export async function weeklySetsByMuscle(weeks = 4, today: string = todayIST()): Promise<MuscleWeek[]> {
  const currentMonday = addDays(today, -(isoWeekday(today) - 1));
  const from = addDays(currentMonday, -7 * (weeks - 1));
  const to = addDays(currentMonday, 6);
  const res = await db.execute<{ week_start: string; muscle_group: string; n: number }>(sql`
    select date_trunc('week', s.date)::date::text as week_start, e.muscle_group, count(*)::int as n
    from sets st
    join sessions s on s.id = st.session_id
    join exercises e on e.id = st.exercise_id
    where st.is_working and s.date between ${from} and ${to}
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
