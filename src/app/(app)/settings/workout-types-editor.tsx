"use client";

import { useState, useTransition } from "react";
import { MUSCLE_GROUPS, type MuscleGroup } from "@/lib/routine";
import type { ExerciseLite } from "@/lib/training";
import {
  addRoutineExercise, addWorkoutType, moveRoutineExercise, moveWorkoutType, removeRoutineExercise, renameWorkoutType,
  saveExerciseCues, saveWeeklySessionTarget, setRoutineTargets, setWorkoutTypeArchived,
} from "./actions";
import { btn, Card, input, primary } from "./ui";

export type WorkoutTypeView = {
  id: number;
  label: string;
  archived: boolean;
  exercises: { exerciseId: number; name: string; muscleGroup: string; cues: string | null; targetSets: number; targetReps: number }[];
};

type Result = { ok: boolean; error?: string; warning?: string | null };
type Run = (fn: () => Promise<Result>) => void;

export function WorkoutTypesEditor({ types, allExercises, weeklyTarget }: { types: WorkoutTypeView[]; allExercises: ExerciseLite[]; weeklyTarget: number }) {
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [, start] = useTransition();
  const run: Run = (fn) => {
    setError(null);
    setWarning(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Failed");
      else if (r.warning) setWarning(r.warning);
    });
  };
  const active = types.filter((t) => !t.archived);
  const archived = types.filter((t) => t.archived);

  return (
    <Card title="Workout types" sub="You pick one each day. List order = rotation for “next up”. Names also work as bot commands." collapsible defaultOpen={false}>
      <label className="mb-4 flex items-center justify-between gap-3">
        <span>
          <span className="block font-medium">Sessions per week</span>
          <span className="block text-xs text-muted">Target for adherence, the weekly report and the checkpoint</span>
        </span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={14}
          defaultValue={weeklyTarget}
          onBlur={(e) => Number(e.target.value) !== weeklyTarget && run(() => saveWeeklySessionTarget(Number(e.target.value)))}
          className="h-12 w-20 rounded-xl border border-border bg-bg text-center text-lg tabular-nums"
        />
      </label>

      <div className="flex flex-col gap-3">
        {active.map((t, i) => (
          <TypeEditor key={t.id} type={t} first={i === 0} last={i === active.length - 1} allExercises={allExercises} run={run} />
        ))}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = newName.trim();
          if (!n) return;
          run(async () => {
            const r = await addWorkoutType(n);
            if (r.ok) setNewName("");
            return r;
          });
        }}
      >
        <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={30} placeholder="New type, e.g. Arms" className={`${input} h-11`} />
        <button type="submit" className={`${primary} h-11 shrink-0`}>Add</button>
      </form>

      {archived.length ? (
        <div className="mt-4">
          <h3 className="text-xs font-medium text-muted">Archived — kept for history, hidden from the picker</h3>
          <ul className="mt-1 divide-y divide-border">
            {archived.map((t) => (
              <li key={t.id} className="flex h-11 items-center justify-between">
                <span className="text-sm text-muted">{t.label}</span>
                <button type="button" onClick={() => run(() => setWorkoutTypeArchived(t.id, false))} className="h-10 px-2 text-sm font-medium text-accent">
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {warning ? <p className="mt-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">{warning}</p> : null}
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </Card>
  );
}

function TypeEditor({ type, first, last, allExercises, run }: { type: WorkoutTypeView; first: boolean; last: boolean; allExercises: ExerciseLite[]; run: Run }) {
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const inType = new Set(type.exercises.map((e) => e.exerciseId));
  const dayId = type.id;

  return (
    <details className="group rounded-xl border border-border">
      <summary className="flex cursor-pointer list-none items-center gap-1 px-2 py-2 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-col">
          <button type="button" disabled={first} onClick={(e) => { e.preventDefault(); run(() => moveWorkoutType(type.id, "up")); }} aria-label={`Move ${type.label} up`} className="flex size-7 items-center justify-center text-muted disabled:opacity-25">▲</button>
          <button type="button" disabled={last} onClick={(e) => { e.preventDefault(); run(() => moveWorkoutType(type.id, "down")); }} aria-label={`Move ${type.label} down`} className="flex size-7 items-center justify-center text-muted disabled:opacity-25">▼</button>
        </span>
        {renaming ? (
          <input
            autoFocus
            defaultValue={type.label}
            maxLength={30}
            onClick={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if (e.key === " ") e.stopPropagation();
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            onBlur={(e) => {
              setRenaming(false);
              const v = e.target.value.trim();
              if (v && v !== type.label) run(() => renameWorkoutType(type.id, v));
            }}
            className={`${input} h-10 flex-1`}
          />
        ) : (
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{type.label}</span>
            <span className="block text-[11px] text-muted">{type.exercises.length} exercises</span>
          </span>
        )}
        <button type="button" onClick={(e) => { e.preventDefault(); setRenaming(true); }} className="h-9 px-2 text-xs text-accent">Rename</button>
        <button type="button" onClick={(e) => { e.preventDefault(); run(() => setWorkoutTypeArchived(type.id, true)); }} className="h-9 px-2 text-xs text-muted">Archive</button>
        <span className="px-1 text-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <ul className="divide-y divide-border border-t border-border">
        {type.exercises.map((e, i) => (
          <ExerciseRow key={e.exerciseId} dayId={dayId} e={e} first={i === 0} last={i === type.exercises.length - 1} run={run} />
        ))}
        {type.exercises.length === 0 ? <li className="p-3 text-sm text-muted">No exercises.</li> : null}
      </ul>
      <div className="p-2">
        {adding ? (
          <AddToDay allExercises={allExercises.filter((x) => !inType.has(x.id))} onPick={(input) => { run(() => addRoutineExercise(dayId, input)); setAdding(false); }} onClose={() => setAdding(false)} />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={`${btn} h-10 w-full text-xs`}>+ Exercise</button>
        )}
      </div>
    </details>
  );
}

function ExerciseRow({ dayId, e, first, last, run }: { dayId: number; e: WorkoutTypeView["exercises"][number]; first: boolean; last: boolean; run: Run }) {
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
