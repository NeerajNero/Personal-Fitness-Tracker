"use client";

import { useState, useTransition } from "react";
import { MUSCLE_GROUPS, ROUTINE_LABEL, type MuscleGroup, type RoutineDayName } from "@/lib/routine";
import type { ExerciseLite } from "@/lib/training";
import { addRoutineExercise, moveRoutineExercise, removeRoutineExercise, saveExerciseCues, setRoutineTargets, setRoutineWeekday } from "./actions";
import { btn, Card, input, primary } from "./ui";

export type RoutineDayView = {
  id: number;
  name: RoutineDayName;
  weekday: number;
  exercises: { exerciseId: number; name: string; muscleGroup: string; cues: string | null; targetSets: number; targetReps: number }[];
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function RoutineEditor({ days, allExercises }: { days: RoutineDayView[]; allExercises: ExerciseLite[] }) {
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Failed");
    });
  };
  const counts = new Map<number, number>();
  for (const d of days) counts.set(d.weekday, (counts.get(d.weekday) ?? 0) + 1);
  const clashes = days.filter((d) => (counts.get(d.weekday) ?? 0) > 1).map((d) => ROUTINE_LABEL[d.name]);

  return (
    <Card title="Routine" sub="Upper/Lower 4-day. Order, targets and weekdays." collapsible defaultOpen={false}>
      {clashes.length ? (
        <p className="mb-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          Two routine days share a weekday ({clashes.join(", ")}). Only the first is used on that day.
        </p>
      ) : null}
      <div className="flex flex-col gap-4">
        {days.map((d) => (
          <DayEditor key={d.id} day={d} allExercises={allExercises} run={run} />
        ))}
      </div>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </Card>
  );
}

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>) => void;

function DayEditor({ day, allExercises, run }: { day: RoutineDayView; allExercises: ExerciseLite[]; run: Run }) {
  const [adding, setAdding] = useState(false);
  const inDay = new Set(day.exercises.map((e) => e.exerciseId));

  return (
    <section className="rounded-xl border border-border">
      <header className="flex items-center justify-between gap-2 px-3 py-2">
        <h3 className="font-semibold">{ROUTINE_LABEL[day.name]}</h3>
        <select
          value={day.weekday}
          onChange={(e) => run(() => setRoutineWeekday(day.id, Number(e.target.value)))}
          aria-label={`${ROUTINE_LABEL[day.name]} weekday`}
          className="h-10 rounded-lg border border-border bg-bg px-2 text-sm"
        >
          {WEEKDAYS.map((w, i) => (
            <option key={w} value={i + 1}>{w}</option>
          ))}
        </select>
      </header>
      <ul className="divide-y divide-border border-t border-border">
        {day.exercises.map((e, i) => (
          <ExerciseRow key={e.exerciseId} dayId={day.id} e={e} first={i === 0} last={i === day.exercises.length - 1} run={run} />
        ))}
        {day.exercises.length === 0 ? <li className="p-3 text-sm text-muted">No exercises.</li> : null}
      </ul>
      <div className="p-2">
        {adding ? (
          <AddToDay allExercises={allExercises.filter((x) => !inDay.has(x.id))} onPick={(input) => { run(() => addRoutineExercise(day.id, input)); setAdding(false); }} onClose={() => setAdding(false)} />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={`${btn} h-10 w-full text-xs`}>+ Exercise</button>
        )}
      </div>
    </section>
  );
}

function ExerciseRow({ dayId, e, first, last, run }: { dayId: number; e: RoutineDayView["exercises"][number]; first: boolean; last: boolean; run: Run }) {
  const [cuesOpen, setCuesOpen] = useState(false);
  const [sets, setSets] = useState(String(e.targetSets));
  const [reps, setReps] = useState(String(e.targetReps));
  const commit = () => {
    if (Number(sets) === e.targetSets && Number(reps) === e.targetReps) return;
    run(() => setRoutineTargets(dayId, e.exerciseId, Number(sets), Number(reps)));
  };
  const small = "h-10 w-12 rounded-lg border border-border bg-bg text-center text-sm tabular-nums";

  return (
    <li className="px-2 py-2">
      <div className="flex items-center gap-1">
        <div className="flex flex-col">
          <button type="button" disabled={first} onClick={() => run(() => moveRoutineExercise(dayId, e.exerciseId, "up"))} aria-label="Move up" className="flex size-7 items-center justify-center text-muted disabled:opacity-25">▲</button>
          <button type="button" disabled={last} onClick={() => run(() => moveRoutineExercise(dayId, e.exerciseId, "down"))} aria-label="Move down" className="flex size-7 items-center justify-center text-muted disabled:opacity-25">▼</button>
        </div>
        <button type="button" onClick={() => setCuesOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-medium">{e.name}</span>
          <span className="block text-[11px] text-muted">{e.muscleGroup}{e.cues ? " · has cues" : ""}</span>
        </button>
        <input type="number" inputMode="numeric" min={1} max={10} value={sets} onChange={(ev) => setSets(ev.target.value)} onBlur={commit} aria-label="Target sets" className={small} />
        <span className="text-xs text-muted">×</span>
        <input type="number" inputMode="numeric" min={1} max={50} value={reps} onChange={(ev) => setReps(ev.target.value)} onBlur={commit} aria-label="Target reps" className={small} />
        <button type="button" onClick={() => run(() => removeRoutineExercise(dayId, e.exerciseId))} aria-label={`Remove ${e.name}`} className="flex size-9 items-center justify-center text-lg text-muted">×</button>
      </div>
      {cuesOpen ? (
        <div className="mt-2 pl-8">
          <textarea
            defaultValue={e.cues ?? ""}
            rows={4}
            maxLength={1000}
            placeholder="Cues shown on the Train screen for this exercise (all days)."
            onBlur={(ev) => ev.target.value.trim() !== (e.cues ?? "").trim() && run(() => saveExerciseCues(e.exerciseId, ev.target.value))}
            className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <p className="text-[11px] text-muted">Saves when you tap away.</p>
        </div>
      ) : null}
    </li>
  );
}

function AddToDay({ allExercises, onPick, onClose }: { allExercises: ExerciseLite[]; onPick: (input: { exerciseId: number } | { name: string; muscleGroup: MuscleGroup }) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [mg, setMg] = useState<MuscleGroup>("back");
  const lower = q.trim().toLowerCase();
  const matches = allExercises.filter((e) => !lower || e.name.toLowerCase().includes(lower)).slice(0, 8);
  const exact = allExercises.some((e) => e.name.toLowerCase() === lower);
  return (
    <div className="rounded-xl border border-border bg-bg/50 p-2">
      <div className="flex gap-2">
        <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or type a new exercise" className={`${input} h-10 text-sm`} />
        <button type="button" onClick={onClose} className={`${btn} h-10 px-3 text-xs`}>Close</button>
      </div>
      <ul className="mt-1 max-h-48 divide-y divide-border overflow-y-auto">
        {matches.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onPick({ exerciseId: e.id })} className="flex h-10 w-full items-center justify-between px-2 text-left text-sm active:bg-bg">
              <span>{e.name}</span><span className="text-xs text-muted">{e.muscleGroup}</span>
            </button>
          </li>
        ))}
        {lower && !exact ? (
          <li className="flex items-center gap-2 px-1 py-2">
            <select value={mg} onChange={(e) => setMg(e.target.value as MuscleGroup)} aria-label="Muscle group" className="h-10 rounded-lg border border-border bg-bg px-2 text-sm">
              {MUSCLE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <button type="button" onClick={() => onPick({ name: q.trim(), muscleGroup: mg })} className={`${primary} h-10 flex-1 text-sm`}>Create “{q.trim()}”</button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
