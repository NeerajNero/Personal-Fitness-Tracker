"use client";

import { Ellipsis, Plus } from "lucide-react";
import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { CheckIcon, ICON, MuscleIcon } from "@/components/icons";
import { big, ErrorLine, label, primary } from "@/components/ui";
import type { ExerciseCard, ExerciseLite, SessionDetail } from "@/lib/training";
import { MUSCLE_GROUPS, type MuscleGroup } from "@/lib/routine";
import { addExerciseToSession, deleteSet, discardSession, sameAsLast, saveSessionNotes, upsertSet } from "./actions";
import { FinisherRow } from "./finisher";

const btn = "flex items-center justify-center gap-1.5 rounded-xl border border-border bg-bg active:opacity-70 disabled:opacity-50";
/** Server errors are short ("Session not found"); add what to do about them. */
const explain = (e: string) => (/not found/i.test(e) ? `${e}. Reload the page and try again.` : `${e}. Check the value and try again.`);
const fmtW = (w: number) => (Number.isInteger(w) ? String(w) : w.toFixed(2).replace(/\.?0+$/, ""));

let tempId = -1;

/**
 * Confirm by exception: each exercise is one line. ✓ logs it the same as last time;
 * tapping the line opens the set grid only when something changed.
 */
/** `userEquipment` = a home user's gear (the search filters by it); null for gym users, whose screen is unchanged. */
export function SessionView({ session, allExercises, userEquipment }: { session: SessionDetail; allExercises: ExerciseLite[]; userEquipment: string[] | null }) {
  const [cards, addCard] = useOptimistic<ExerciseCard[], ExerciseCard>(session.exercises, (list, c) => [...list, c]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [armed, setArmed] = useState(false);
  const [notesStatus, setNotesStatus] = useState<"idle" | "saved" | "error">("idle");
  const savedNotes = useRef(session.notes ?? "");

  const inSession = useMemo(() => new Set(cards.map((c) => c.exerciseId)), [cards]);
  const logged = cards.filter((c) => c.sets.length > 0).length;
  const sameable = cards.filter((c) => c.sets.length === 0 && c.hint.last !== null).length;
  const allDone = cards.length > 0 && logged === cards.length;
  // The one motion in the app: celebrate the moment the last exercise is logged, not a workout that was already done on open.
  const [doneAtMount] = useState(allDone);
  const celebrate = allDone && !doneAtMount;

  function allSame() {
    setError(null);
    startTransition(async () => {
      const r = await sameAsLast(session.id);
      if (!r.ok) setError(explain(r.error));
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
        setError(explain(r.error));
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
        hint: { text: "Adding", mode: "first", suggestedWeight: null, last: null },
        stall: { stalled: false, count: 0 },
        bodyweight: display.equipment.includes("none"),
        measure: display.measure,
        pattern: display.pattern,
        rung: null,
      });
      const r = await addExerciseToSession(session.id, input, alsoAddToType);
      if (r.ok) setOpenId(r.exerciseId);
      else setError(explain(r.error));
    });
  }

  function discard() {
    setArmed(false);
    startTransition(async () => {
      const r = await discardSession(session.id);
      if (!r.ok) setError(explain(r.error));
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <header>
        <div className="flex items-center justify-between gap-3">
          <p className={`flex items-center gap-2 ${big} ${allDone ? "text-done" : ""}`}>
            {allDone ? <CheckIcon size={28} strokeWidth={2.5} className={celebrate ? "celebrate" : undefined} /> : null}
            {logged} <span className={`${label} text-base`}>of {cards.length} logged</span>
          </p>
          <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} aria-label="Notes and discard" className="flex size-10 items-center justify-center text-muted active:opacity-70">
            <Ellipsis {...ICON} size={22} />
          </button>
        </div>

        {sameable > 0 ? (
          <button type="button" disabled={pending} onClick={allSame} className={`${primary} mt-3 w-full`}>
            <CheckIcon strokeWidth={2.5} /> Log all the same as last time{sameable < cards.length ? ` (${sameable} left)` : ""}
          </button>
        ) : null}


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
            <span className="text-xs text-done" aria-live="polite">
              {notesStatus === "saved" ? "Saved" : null}
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
                Discard this workout
              </button>
            )}
          </div>
        ) : null}
      </header>

      <ErrorLine>{error}</ErrorLine>

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {cards.map((c) =>
          c.pattern === "conditioning" ? (
            <FinisherRow key={c.exerciseId} sessionId={session.id} card={c} onError={setError} />
          ) : (
            <ExerciseRow
              key={c.exerciseId}
              sessionId={session.id}
              card={c}
              open={openId === c.exerciseId}
              onToggle={() => setOpenId(openId === c.exerciseId ? null : c.exerciseId)}
              onError={setError}
            />
          ),
        )}
      </ul>

      <AddExercise allExercises={allExercises} inSession={inSession} typeName={session.typeId !== null ? session.typeName : null} userEquipment={userEquipment} onAdd={addExercise} />
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

/** "45 kg × 10/10/9" when every set used one weight, else "45×10, 42.5×9". Bodyweight: "3 × 12/12/11" or "30/30/25 s". */
function summary(rows: Row[], card: ExerciseCard): string {
  const saved = rows.filter((r) => r.savedWeight !== null && r.savedReps !== null);
  if (card.bodyweight) {
    const reps = saved.map((r) => r.savedReps).join("/");
    return card.measure === "seconds" ? `${reps} s` : `${saved.length} × ${reps}`;
  }
  const weights = new Set(saved.map((r) => r.savedWeight));
  if (weights.size === 1) {
    const w = saved[0].savedWeight;
    return `${w === "0" ? "Bodyweight" : `${w} kg`} × ${saved.map((r) => r.savedReps).join("/")}`;
  }
  return saved.map((r) => `${r.savedWeight}×${r.savedReps}`).join(", ");
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
  const bw = card.bodyweight;
  const unit = card.measure === "seconds" ? "s" : "reps";
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
      if (!r.ok) onError(explain(r.error));
    });
  }

  function commit(i: number) {
    const r = rows[i];
    const weight = bw ? "0" : r?.weight;
    if (!r || weight === "" || r.reps === "") return;
    if (weight === r.savedWeight && r.reps === r.savedReps) return;
    patch(i, { status: "saving", error: undefined });
    startTransition(async () => {
      const res = await upsertSet({ sessionId, exerciseId: card.exerciseId, setNo: r.setNo, weightKg: weight, reps: r.reps });
      if (res.ok) {
        patch(i, { status: "saved", savedWeight: weight, savedReps: r.reps });
        setTimeout(() => setRows((rs) => rs.map((x, j) => (j === i && x.status === "saved" ? { ...x, status: "idle" } : x))), 1500);
      } else {
        patch(i, { status: "error", error: explain(res.error) });
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
        if (!res.ok) onError(explain(res.error));
      });
    }
  }

  const input = "h-12 w-full rounded-xl border border-border bg-bg text-center text-lg outline-none focus:border-accent";

  return (
    <li className={pending ? "opacity-60" : ""}>
      <div className="flex min-h-16 items-center gap-3 pl-4 pr-2">
        <MuscleIcon group={card.muscleGroup} className={`shrink-0 ${done ? "text-done" : "text-muted"}`} />
        <button type="button" disabled={pending} onClick={onToggle} aria-expanded={open} className="min-w-0 flex-1 py-2 text-left">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">{card.name}</span>
            {card.rung ? <span className="shrink-0 text-[11px] font-medium text-muted">rung {card.rung.level} of {card.rung.max}</span> : null}
            {card.stall.stalled || card.hint.mode === "stall" ? <span className="shrink-0 rounded-full border border-warn/40 px-2 text-[11px] font-medium text-warn">Stalled</span> : null}
          </span>
          <span className={`flex items-center gap-1 truncate text-sm ${done ? "font-medium text-done" : card.hint.mode === "up" ? "font-medium text-accent" : "text-muted"}`}>
            {done ? <CheckIcon size={14} strokeWidth={2.5} /> : null}
            {done ? summary(rows, card) : card.hint.text}
          </span>
        </button>
        {!done && last ? (
          <button type="button" disabled={pending || sameing} onClick={same} aria-label={`${card.name}: same as last time`} className={`${btn} h-12 w-14 shrink-0 text-accent`}>
            {sameing ? <span className="text-sm">…</span> : <CheckIcon size={22} strokeWidth={2.5} />}
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="px-4 pb-4">
          {card.stall.stalled ? <p className="text-xs text-warn">No new best in {card.stall.count} sessions. Drop about 10% and rebuild, or swap the variation.</p> : null}
          {card.cues ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs font-medium text-accent">Cues</summary>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-xs leading-relaxed text-fg">{card.cues}</pre>
            </details>
          ) : null}

          <div className={`mt-2 grid items-center gap-x-2 gap-y-2 ${bw ? "grid-cols-[1.75rem_1fr_1.5rem]" : "grid-cols-[1.75rem_1fr_1fr_1.5rem]"}`}>
            <span className="text-[11px] text-muted">Set</span>
            {bw ? null : <span className="text-center text-[11px] text-muted">kg</span>}
            <span className="text-center text-[11px] text-muted">{unit}</span>
            <span />
            {rows.map((r, i) => (
              <SetRow
                key={r.setNo}
                row={r}
                inputCls={input}
                bodyweight={bw}
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
              Add a set
            </button>
            <button type="button" disabled={pending || rows.length === 0} onClick={removeSet} className={`${btn} h-11 flex-1 text-sm font-medium`}>
              Remove last set
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
  bodyweight,
  weightHint,
  repsHint,
  onChange,
  onCommit,
}: {
  row: Row;
  inputCls: string;
  bodyweight: boolean;
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
      <span className="text-sm text-muted">{r.setNo}</span>
      {bodyweight ? null : (
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
      )}
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
        {r.status === "saved" ? <CheckIcon size={16} strokeWidth={2.5} className="inline text-done" /> : null}
        {r.status === "error" ? <span className="text-danger">!</span> : null}
      </span>
    </>
  );
}

/* -------------------------------- + exercise ------------------------------- */

/** Exercises a home user can do with what they have (household items count as none). */
export function fitsEquipment(e: Pick<ExerciseLite, "equipment">, userEquipment: string[]): boolean {
  const allowed = new Set(["none", ...userEquipment]);
  return e.equipment.length > 0 && e.equipment.every((x) => allowed.has(x));
}

const newLite = (id: number, name: string, muscleGroup: MuscleGroup): ExerciseLite => ({ id, name, muscleGroup, equipment: [], measure: "reps", pattern: null, ladder: null, ladderLevel: null });

function AddExercise({
  allExercises,
  inSession,
  typeName,
  userEquipment,
  onAdd,
}: {
  allExercises: ExerciseLite[];
  inSession: Set<number>;
  /** The session's workout type; null for custom sessions (no "also add" toggle). */
  typeName: string | null;
  /** Home users: filter by their gear unless "Show all"; null = gym, no filter. */
  userEquipment: string[] | null;
  onAdd: (input: { exerciseId: number } | { name: string; muscleGroup: MuscleGroup }, display: ExerciseLite, alsoAddToType: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [also, setAlso] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState("");
  const [mg, setMg] = useState<MuscleGroup>("back");
  const query = q.trim();
  const lower = query.toLowerCase();
  const pool = userEquipment && !showAll ? allExercises.filter((e) => fitsEquipment(e, userEquipment)) : allExercises;
  const matches = pool.filter((e) => !inSession.has(e.id) && (lower === "" || e.name.toLowerCase().includes(lower))).slice(0, 16);
  const exact = allExercises.some((e) => e.name.toLowerCase() === lower);

  function pick(e: ExerciseLite) {
    onAdd({ exerciseId: e.id }, e, also);
    setQ("");
    setOpen(false);
  }
  function create() {
    if (!query) return;
    onAdd({ name: query, muscleGroup: mg }, newLite(tempId--, query, mg), also);
    setQ("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex h-11 w-full items-center justify-center gap-1.5 text-sm font-medium text-accent active:opacity-70">
        <Plus {...ICON} /> Add an exercise
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
      {userEquipment ? (
        <label className="flex h-10 items-center gap-2 px-1 text-sm text-muted">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="size-5 accent-[var(--accent)]" />
          Show all, not only what fits my equipment
        </label>
      ) : null}
      <ul className="mt-2 max-h-64 divide-y divide-border overflow-y-auto">
        {matches.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => pick(e)} className="flex h-12 w-full items-center justify-between gap-2 px-2 text-left active:bg-bg">
              <span className="flex min-w-0 items-center gap-2 font-medium"><MuscleIcon group={e.muscleGroup} className="shrink-0 text-muted" /> <span className="truncate">{e.name}</span></span>
              <span className="shrink-0 text-xs text-muted">{e.ladder ? `${e.ladder.replace(/_/g, " ")} rung ${e.ladderLevel}` : e.muscleGroup}</span>
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
        {matches.length === 0 && !query ? <li className="p-3 text-sm text-muted">{userEquipment && !showAll ? "Nothing else fits your equipment. Tick Show all, or type a name to create one." : "Every exercise is already in this session. Type a name to create a new one."}</li> : null}
      </ul>
    </div>
  );
}
