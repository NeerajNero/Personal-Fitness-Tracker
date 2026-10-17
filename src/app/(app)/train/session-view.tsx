"use client";

import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import type { ExerciseCard, ExerciseLite, SessionDetail } from "@/lib/training";
import { MUSCLE_GROUPS, type MuscleGroup } from "@/lib/routine";
import { addExerciseToSession, deleteSet, discardSession, sameAsLast, saveSessionNotes, setInclineWalk, upsertSet } from "./actions";

const btn = "flex items-center justify-center rounded-xl border border-border bg-bg active:opacity-70 disabled:opacity-50";
const fmtW = (w: number) => (Number.isInteger(w) ? String(w) : w.toFixed(2).replace(/\.?0+$/, ""));

let tempId = -1;

/**
 * Confirm by exception: each exercise is one line. ✓ logs it the same as last time;
 * tapping the line opens the set grid only when something changed.
 */
export function SessionView({ session, allExercises }: { session: SessionDetail; allExercises: ExerciseLite[] }) {
  const [cards, addCard] = useOptimistic<ExerciseCard[], ExerciseCard>(session.exercises, (list, c) => [...list, c]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [incline, setIncline] = useState(session.inclineWalk);
  const [openId, setOpenId] = useState<number | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [armed, setArmed] = useState(false);
  const [notesStatus, setNotesStatus] = useState<"idle" | "saved" | "error">("idle");
  const savedNotes = useRef(session.notes ?? "");

  const inSession = useMemo(() => new Set(cards.map((c) => c.exerciseId)), [cards]);
  const logged = cards.filter((c) => c.sets.length > 0).length;
  const sameable = cards.filter((c) => c.sets.length === 0 && c.hint.last !== null).length;

  function allSame() {
    setError(null);
    startTransition(async () => {
      const r = await sameAsLast(session.id);
      if (!r.ok) setError(r.error);
    });
  }

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

  function addExercise(input: { exerciseId: number } | { name: string; muscleGroup: MuscleGroup }, display: ExerciseLite, alsoAddToType: boolean) {
    setError(null);
    setOpenId(display.id);
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
      const r = await addExerciseToSession(session.id, input, alsoAddToType);
      if (r.ok) setOpenId(r.exerciseId);
      else setError(r.error);
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
    <section className="flex flex-col gap-3">
      <header className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {logged} / {cards.length} logged
          </p>
          <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} aria-label="More options" className="h-10 px-3 text-xl text-muted active:opacity-70">
            ⋯
          </button>
        </div>

        {sameable > 0 ? (
          <button type="button" disabled={pending} onClick={allSame} className="mt-3 h-14 w-full rounded-xl bg-accent text-lg font-medium text-accent-fg active:opacity-80 disabled:opacity-60">
            ✓ All same as last time{sameable < cards.length ? ` (${sameable} left)` : ""}
          </button>
        ) : null}

        <label className="mt-3 flex h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-bg px-4">
          <input type="checkbox" checked={incline} onChange={toggleIncline} className="size-5 accent-[var(--accent)]" />
          <span className="text-sm font-medium">Incline walk 15–20 min</span>
        </label>

        {showMore ? (
          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
            <textarea
              defaultValue={session.notes ?? ""}
              onBlur={(e) => commitNotes(e.target.value)}
              placeholder="Session notes (optional)"
              rows={2}
              maxLength={500}
              className="w-full resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <span className="text-xs text-accent" aria-live="polite">
              {notesStatus === "saved" ? "Saved ✓" : null}
            </span>
            {armed ? (
              <div className="flex gap-2">
                <button type="button" onClick={() => setArmed(false)} className={`${btn} h-11 flex-1 text-sm`}>
                  Keep
                </button>
                <button type="button" onClick={discard} className="h-11 flex-1 rounded-xl bg-danger text-sm font-medium text-white active:opacity-80">
                  Discard workout
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setArmed(true)} className="h-11 text-left text-sm text-danger active:opacity-70">
                Discard this workout…
              </button>
            )}
          </div>
        ) : null}
      </header>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {cards.map((c) => (
          <ExerciseRow
            key={c.exerciseId}
            sessionId={session.id}
            card={c}
            open={openId === c.exerciseId}
            onToggle={() => setOpenId(openId === c.exerciseId ? null : c.exerciseId)}
            onError={setError}
          />
        ))}
      </ul>

      <AddExercise allExercises={allExercises} inSession={inSession} typeName={session.typeId !== null ? session.typeName : null} onAdd={addExercise} />
    </section>
  );
}

/* ------------------------------- exercise row ------------------------------ */

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
  const n = Math.max(card.targetSets, card.hint.last?.reps.length ?? 0);
  return Array.from({ length: n }, (_, i) => ({ setNo: i + 1, weight: "", reps: "", savedWeight: null, savedReps: null, status: "idle" }));
}

/** "45 kg × 10/10/9" when every set used one weight, else "45×10 · 42.5×9". */
function summary(rows: Row[]): string {
  const saved = rows.filter((r) => r.savedWeight !== null && r.savedReps !== null);
  const weights = new Set(saved.map((r) => r.savedWeight));
  if (weights.size === 1) {
    const w = saved[0].savedWeight;
    return `${w === "0" ? "BW" : `${w} kg`} × ${saved.map((r) => r.savedReps).join("/")}`;
  }
  return saved.map((r) => `${r.savedWeight}×${r.savedReps}`).join(" · ");
}

function ExerciseRow({
  sessionId,
  card,
  open,
  onToggle,
  onError,
}: {
  sessionId: number;
  card: ExerciseCard;
  open: boolean;
  onToggle: () => void;
  onError: (e: string | null) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => initialRows(card));
  const [sameing, startSame] = useTransition();
  const [, startTransition] = useTransition();
  const pending = card.exerciseId < 0;

  // Sets arrived from the server (✓ / All same) while nothing was saved locally → adopt them.
  const sig = card.sets.map((x) => `${x.setNo}:${x.weightKg}x${x.reps}`).join(",");
  const [prevSig, setPrevSig] = useState(sig);
  if (sig !== prevSig) {
    setPrevSig(sig);
    if (card.sets.length > 0 && !rows.some((r) => r.savedWeight !== null)) setRows(initialRows(card));
  }

  const done = rows.some((r) => r.savedWeight !== null);
  const last = card.hint.last;
  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  function same() {
    onError(null);
    startSame(async () => {
      const r = await sameAsLast(sessionId, card.exerciseId);
      if (!r.ok) onError(r.error);
    });
  }

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
      const l = rs[rs.length - 1];
      return [...rs, { setNo: (l?.setNo ?? 0) + 1, weight: l?.weight ?? "", reps: l?.reps ?? "", savedWeight: null, savedReps: null, status: "idle" }];
    });
  }

  function removeSet() {
    const l = rows[rows.length - 1];
    if (!l) return;
    setRows((rs) => rs.slice(0, -1));
    if (l.savedWeight !== null) {
      startTransition(async () => {
        const res = await deleteSet(sessionId, card.exerciseId, l.setNo);
        if (!res.ok) onError(res.error);
      });
    }
  }

  const input = "h-12 w-full rounded-xl border border-border bg-bg text-center text-lg tabular-nums outline-none focus:border-accent";

  return (
    <li className={pending ? "opacity-60" : ""}>
      <div className="flex min-h-16 items-center gap-2 pl-4 pr-2">
        <button type="button" disabled={pending} onClick={onToggle} aria-expanded={open} className="min-w-0 flex-1 py-2 text-left">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{card.name}</span>
            {card.stall.stalled ? <span className="shrink-0 rounded-full bg-warn/15 px-2 text-[11px] font-medium text-warn">stalled</span> : null}
          </span>
          <span className={`block truncate text-sm ${done ? "text-accent" : "text-muted"}`}>{done ? `✓ ${summary(rows)}` : card.hint.text}</span>
        </button>
        {!done && last ? (
          <button type="button" disabled={pending || sameing} onClick={same} aria-label={`${card.name}: same as last time`} className={`${btn} h-12 w-14 shrink-0 text-lg font-semibold text-accent`}>
            {sameing ? "…" : "✓"}
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="px-4 pb-4">
          {card.stall.stalled ? <p className="text-xs text-warn">No new best in {card.stall.count} sessions — drop ~10% and rebuild, or swap the variation.</p> : null}
          {card.cues ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs font-medium text-accent">Cues</summary>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-xs leading-relaxed text-fg">{card.cues}</pre>
            </details>
          ) : null}

          <div className="mt-2 grid grid-cols-[1.75rem_1fr_1fr_1.5rem] items-center gap-x-2 gap-y-2">
            <span className="text-[11px] text-muted">Set</span>
            <span className="text-center text-[11px] text-muted">kg</span>
            <span className="text-center text-[11px] text-muted">reps</span>
            <span />
            {rows.map((r, i) => (
              <SetRow
                key={r.setNo}
                row={r}
                inputCls={input}
                weightHint={last ? fmtW(last.weightKg) : "kg"}
                repsHint={String(last?.reps[i] ?? card.targetReps)}
                onChange={(p) => patch(i, p)}
                onCommit={() => commit(i)}
              />
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
        </div>
      ) : null}
    </li>
  );
}

function SetRow({
  row: r,
  inputCls,
  weightHint,
  repsHint,
  onChange,
  onCommit,
}: {
  row: Row;
  inputCls: string;
  weightHint: string;
  repsHint: string;
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
        placeholder={weightHint}
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
        placeholder={repsHint}
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
  typeName,
  onAdd,
}: {
  allExercises: ExerciseLite[];
  inSession: Set<number>;
  /** The session's workout type; null for custom sessions (no "also add" toggle). */
  typeName: string | null;
  onAdd: (input: { exerciseId: number } | { name: string; muscleGroup: MuscleGroup }, display: ExerciseLite, alsoAddToType: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [also, setAlso] = useState(false);
  const [q, setQ] = useState("");
  const [mg, setMg] = useState<MuscleGroup>("back");
  const query = q.trim();
  const lower = query.toLowerCase();
  const matches = allExercises.filter((e) => !inSession.has(e.id) && (lower === "" || e.name.toLowerCase().includes(lower))).slice(0, 12);
  const exact = allExercises.some((e) => e.name.toLowerCase() === lower);

  function pick(e: ExerciseLite) {
    onAdd({ exerciseId: e.id }, e, also);
    setQ("");
    setOpen(false);
  }
  function create() {
    if (!query) return;
    onAdd({ name: query, muscleGroup: mg }, { id: tempId--, name: query, muscleGroup: mg }, also);
    setQ("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-11 w-full text-sm font-medium text-accent active:opacity-70">
        + Add an exercise
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
          placeholder="Search all exercises or type a new one"
          className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-bg px-4 outline-none focus:border-accent"
        />
        <button type="button" onClick={() => setOpen(false)} className={`${btn} h-12 px-4 text-sm`}>
          Close
        </button>
      </div>
      {typeName ? (
        <label className="mt-2 flex h-10 items-center gap-2 px-1 text-sm text-muted">
          <input type="checkbox" checked={also} onChange={(e) => setAlso(e.target.checked)} className="size-5 accent-[var(--accent)]" />
          Also add to {typeName}
        </label>
      ) : null}
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
