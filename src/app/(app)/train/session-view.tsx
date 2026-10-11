"use client";

import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import type { ExerciseCard, ExerciseLite, SessionDetail } from "@/lib/training";
import { MUSCLE_GROUPS, ROUTINE_LABEL, type MuscleGroup } from "@/lib/routine";
import { addExerciseToSession, deleteSet, discardSession, saveSessionNotes, setInclineWalk, upsertSet } from "./actions";

const btn = "flex items-center justify-center rounded-xl border border-border bg-bg active:opacity-70 disabled:opacity-50";
const fmtW = (w: number) => (Number.isInteger(w) ? String(w) : w.toFixed(2).replace(/\.?0+$/, ""));

let tempId = -1;

export function SessionView({ session, allExercises }: { session: SessionDetail; allExercises: ExerciseLite[] }) {
  const [cards, addCard] = useOptimistic<ExerciseCard[], ExerciseCard>(session.exercises, (list, c) => [...list, c]);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [incline, setIncline] = useState(session.inclineWalk);
  const [armed, setArmed] = useState(false);
  const [notesStatus, setNotesStatus] = useState<"idle" | "saved" | "error">("idle");
  const savedNotes = useRef(session.notes ?? "");

  const title = session.routineDayName ? ROUTINE_LABEL[session.routineDayName] : "Ad-hoc session";
  const inSession = useMemo(() => new Set(cards.map((c) => c.exerciseId)), [cards]);

  function toggleIncline() {
    const v = !incline;
    setIncline(v);
    setError(null);
    startTransition(async () => {
      const r = await setInclineWalk(session.id, v);
      if (!r.ok) {
        setIncline(!v);
        setError(r.error);
      }
    });
  }

  function commitNotes(value: string) {
    if (value.trim() === savedNotes.current.trim()) return;
    startTransition(async () => {
      const r = await saveSessionNotes(session.id, value);
      if (r.ok) {
        savedNotes.current = value;
        setNotesStatus("saved");
        setTimeout(() => setNotesStatus("idle"), 1500);
      } else {
        setNotesStatus("error");
        setError(r.error);
      }
    });
  }

  function addExercise(input: { exerciseId: number } | { name: string; muscleGroup: MuscleGroup }, display: ExerciseLite) {
    setError(null);
    startTransition(async () => {
      addCard({
        exerciseId: display.id,
        name: display.name,
        muscleGroup: display.muscleGroup,
        cues: null,
        targetSets: 3,
        targetReps: 8,
        sets: [],
        hint: { text: "…", mode: "first", suggestedWeight: null, last: null },
        stall: { stalled: false, count: 0 },
      });
      const r = await addExerciseToSession(session.id, input);
      if (!r.ok) setError(r.error);
    });
  }

  function discard() {
    setArmed(false);
    startTransition(async () => {
      const r = await discardSession(session.id);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted">Session</p>
            <h2 className="text-2xl font-semibold">{title}</h2>
          </div>
          {armed ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setArmed(false)} className={`${btn} h-10 px-3 text-sm`}>
                Keep
              </button>
              <button type="button" onClick={discard} className="h-10 rounded-xl bg-danger px-3 text-sm font-medium text-white active:opacity-80">
                Discard
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setArmed(true)} className="h-10 px-2 text-sm text-muted active:opacity-70">
              Discard
            </button>
          )}
        </div>

        <label className="mt-4 flex h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-bg px-4">
          <input type="checkbox" checked={incline} onChange={toggleIncline} className="size-5 accent-[var(--accent)]" />
          <span className="text-sm font-medium">Incline walk 15–20 min</span>
        </label>

        <div className="mt-3">
          <textarea
            defaultValue={session.notes ?? ""}
            onBlur={(e) => commitNotes(e.target.value)}
            placeholder="Session notes (optional)"
            rows={2}
            maxLength={500}
            className="w-full resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <span className="text-xs text-accent" aria-live="polite">
            {notesStatus === "saved" ? "Saved ✓" : " "}
          </span>
        </div>
      </header>

      {cards.map((c) => (
        <ExerciseCardView key={c.exerciseId} sessionId={session.id} card={c} onError={setError} />
      ))}

      <AddExercise allExercises={allExercises} inSession={inSession} onAdd={addExercise} />

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </section>
  );
}

/* ------------------------------ exercise card ------------------------------ */

type Row = {
  setNo: number;
  weight: string;
  reps: string;
  savedWeight: string | null;
  savedReps: string | null;
  status: "idle" | "saving" | "saved" | "error";
  error?: string;
};

function initialRows(card: ExerciseCard): Row[] {
  if (card.sets.length) {
    return card.sets.map((s) => ({
      setNo: s.setNo,
      weight: fmtW(s.weightKg),
      reps: String(s.reps),
      savedWeight: fmtW(s.weightKg),
      savedReps: String(s.reps),
      status: "idle",
    }));
  }
  return Array.from({ length: card.targetSets }, (_, i) => ({
    setNo: i + 1,
    weight: "",
    reps: "",
    savedWeight: null,
    savedReps: null,
    status: "idle",
  }));
}

function ExerciseCardView({ sessionId, card, onError }: { sessionId: number; card: ExerciseCard; onError: (e: string | null) => void }) {
  const [rows, setRows] = useState<Row[]>(() => initialRows(card));
  const [, startTransition] = useTransition();
  const pending = card.exerciseId < 0;

  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  function commit(i: number) {
    const r = rows[i];
    if (!r || r.weight === "" || r.reps === "") return;
    if (r.weight === r.savedWeight && r.reps === r.savedReps) return;
    patch(i, { status: "saving", error: undefined });
    startTransition(async () => {
      const res = await upsertSet({ sessionId, exerciseId: card.exerciseId, setNo: r.setNo, weightKg: r.weight, reps: r.reps });
      if (res.ok) {
        patch(i, { status: "saved", savedWeight: r.weight, savedReps: r.reps });
        setTimeout(() => setRows((rs) => rs.map((x, j) => (j === i && x.status === "saved" ? { ...x, status: "idle" } : x))), 1500);
      } else {
        patch(i, { status: "error", error: res.error });
      }
    });
  }

  function addSet() {
    setRows((rs) => {
      const last = rs[rs.length - 1];
      return [
        ...rs,
        { setNo: (last?.setNo ?? 0) + 1, weight: last?.weight ?? "", reps: last?.reps ?? "", savedWeight: null, savedReps: null, status: "idle" },
      ];
    });
  }

  function removeSet() {
    const last = rows[rows.length - 1];
    if (!last) return;
    setRows((rs) => rs.slice(0, -1));
    if (last.savedWeight !== null) {
      startTransition(async () => {
        const res = await deleteSet(sessionId, card.exerciseId, last.setNo);
        if (!res.ok) onError(res.error);
      });
    }
  }

  const input = "h-12 w-full rounded-xl border border-border bg-bg text-center text-lg tabular-nums outline-none focus:border-accent";

  return (
    <article className={`rounded-2xl border border-border bg-surface p-4 ${pending ? "opacity-60" : ""}`}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold leading-tight">{card.name}</h3>
          <p className="text-xs text-muted">
            {card.muscleGroup} · {card.targetSets} × {card.targetReps}
          </p>
        </div>
        {card.stall.stalled ? (
          <span className="shrink-0 rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">Stalled ×{card.stall.count}</span>
        ) : null}
      </header>
      {card.stall.stalled ? <p className="mt-1 text-xs text-warn">Drop ~10% and rebuild, or swap the variation.</p> : null}
      <p className="mt-1 text-xs text-muted">{card.hint.text}</p>

      {card.cues ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-accent">Cues</summary>
          <pre className="mt-1 whitespace-pre-wrap font-sans text-xs leading-relaxed text-fg">{card.cues}</pre>
        </details>
      ) : null}

      <div className="mt-3 grid grid-cols-[1.75rem_1fr_1fr_1.5rem] items-center gap-x-2 gap-y-2">
        <span className="text-[11px] text-muted">Set</span>
        <span className="text-center text-[11px] text-muted">kg</span>
        <span className="text-center text-[11px] text-muted">reps</span>
        <span />
        {rows.map((r, i) => (
          <SetRow key={r.setNo} row={r} inputCls={input} targetReps={card.targetReps} onChange={(p) => patch(i, p)} onCommit={() => commit(i)} />
        ))}
      </div>
      {rows.some((r) => r.error) ? <p className="mt-1 text-xs text-danger">{rows.find((r) => r.error)?.error}</p> : null}

      <div className="mt-3 flex gap-2">
        <button type="button" disabled={pending} onClick={addSet} className={`${btn} h-11 flex-1 text-sm font-medium`}>
          + set
        </button>
        <button type="button" disabled={pending || rows.length === 0} onClick={removeSet} className={`${btn} h-11 flex-1 text-sm font-medium`}>
          − set
        </button>
      </div>
    </article>
  );
}

function SetRow({
  row: r,
  inputCls,
  targetReps,
  onChange,
  onCommit,
}: {
  row: Row;
  inputCls: string;
  targetReps: number;
  onChange: (p: Partial<Row>) => void;
  onCommit: () => void;
}) {
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };
  return (
    <>
      <span className="text-sm text-muted tabular-nums">{r.setNo}</span>
      <input
        type="number"
        inputMode="decimal"
        step="0.5"
        min={0}
        value={r.weight}
        placeholder="kg"
        onChange={(e) => onChange({ weight: e.target.value })}
        onBlur={onCommit}
        onKeyDown={blurOnEnter}
        aria-label={`Set ${r.setNo} weight`}
        className={`${inputCls} ${r.status === "error" ? "border-danger" : ""}`}
      />
      <input
        type="number"
        inputMode="numeric"
        step="1"
        min={1}
        value={r.reps}
        placeholder={String(targetReps)}
        onChange={(e) => onChange({ reps: e.target.value })}
        onBlur={onCommit}
        onKeyDown={blurOnEnter}
        aria-label={`Set ${r.setNo} reps`}
        className={`${inputCls} ${r.status === "error" ? "border-danger" : ""}`}
      />
      <span className="text-center text-sm" aria-live="polite">
        {r.status === "saving" ? <span className="text-muted">…</span> : null}
        {r.status === "saved" ? <span className="text-accent">✓</span> : null}
        {r.status === "error" ? <span className="text-danger">!</span> : null}
      </span>
    </>
  );
}

/* -------------------------------- + exercise ------------------------------- */

function AddExercise({
  allExercises,
  inSession,
  onAdd,
}: {
  allExercises: ExerciseLite[];
  inSession: Set<number>;
  onAdd: (input: { exerciseId: number } | { name: string; muscleGroup: MuscleGroup }, display: ExerciseLite) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [mg, setMg] = useState<MuscleGroup>("back");
  const query = q.trim();
  const lower = query.toLowerCase();
  const matches = allExercises.filter((e) => !inSession.has(e.id) && (lower === "" || e.name.toLowerCase().includes(lower))).slice(0, 12);
  const exact = allExercises.some((e) => e.name.toLowerCase() === lower);

  function pick(e: ExerciseLite) {
    onAdd({ exerciseId: e.id }, e);
    setQ("");
    setOpen(false);
  }
  function create() {
    if (!query) return;
    onAdd({ name: query, muscleGroup: mg }, { id: tempId--, name: query, muscleGroup: mg });
    setQ("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${btn} h-12 w-full text-sm font-medium`}>
        + Exercise
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex gap-2">
        <input
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search or type a new exercise"
          className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-bg px-4 outline-none focus:border-accent"
        />
        <button type="button" onClick={() => setOpen(false)} className={`${btn} h-12 px-4 text-sm`}>
          Close
        </button>
      </div>
      <ul className="mt-2 max-h-64 divide-y divide-border overflow-y-auto">
        {matches.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => pick(e)} className="flex h-12 w-full items-center justify-between px-2 text-left active:bg-bg">
              <span className="font-medium">{e.name}</span>
              <span className="text-xs text-muted">{e.muscleGroup}</span>
            </button>
          </li>
        ))}
        {query && !exact ? (
          <li className="flex items-center gap-2 px-2 py-2">
            <select value={mg} onChange={(e) => setMg(e.target.value as MuscleGroup)} className="h-11 rounded-xl border border-border bg-bg px-2 text-sm" aria-label="Muscle group">
              {MUSCLE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <button type="button" onClick={create} className="h-11 flex-1 rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg active:opacity-80">
              Create “{query}”
            </button>
          </li>
        ) : null}
        {matches.length === 0 && !query ? <li className="p-3 text-sm text-muted">Every exercise is already in this session.</li> : null}
      </ul>
    </div>
  );
}
