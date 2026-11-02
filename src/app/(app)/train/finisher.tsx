"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { CheckIcon, ICON, MuscleIcon } from "@/components/icons";
import { btn, hero, primary } from "@/components/ui";
import type { ExerciseCard } from "@/lib/training";
import { logFinisher } from "./actions";

const WORK = 30;
const REST = 30;
const ROUNDS = 10; // 10 minutes of 30 s on / 30 s off

type Phase = "work" | "rest";

/**
 * The finisher: a 10-minute interval timer (visual countdown, a vibration at each change where the phone supports it,
 * no audio). Completing it, or "Mark done", writes one set row and a cardio entry.
 */
export function FinisherRow({ sessionId, card, onError }: { sessionId: number; card: ExerciseCard; onError: (e: string | null) => void }) {
  const done = card.sets.length > 0;
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // whole seconds of work+rest completed
  const [finished, setFinished] = useState(false);
  const [pending, start] = useTransition();
  const startedAt = useRef<number | null>(null);
  const base = useRef(0);
  const lastPhase = useRef<Phase>("work");

  const total = ROUNDS * (WORK + REST);
  const inRound = elapsed % (WORK + REST);
  const phase: Phase = inRound < WORK ? "work" : "rest";
  const left = phase === "work" ? WORK - inRound : WORK + REST - inRound;
  const round = Math.min(ROUNDS, Math.floor(elapsed / (WORK + REST)) + 1);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const e = Math.floor(base.current + (Date.now() - (startedAt.current ?? Date.now())) / 1000);
      setElapsed(Math.min(total, e));
      if (e >= total) {
        setRunning(false);
        setFinished(true);
        navigator.vibrate?.([200, 100, 200]);
      }
    }, 250);
    return () => clearInterval(id);
  }, [running, total]);

  useEffect(() => {
    if (running && phase !== lastPhase.current) {
      lastPhase.current = phase;
      navigator.vibrate?.(phase === "work" ? 200 : [100, 60, 100]);
    }
  }, [phase, running]);

  function toggle() {
    if (running) {
      base.current = elapsed;
      setRunning(false);
    } else {
      startedAt.current = Date.now();
      setRunning(true);
    }
  }
  function reset() {
    setRunning(false);
    base.current = 0;
    setElapsed(0);
    setFinished(false);
  }
  function log() {
    onError(null);
    start(async () => {
      const r = await logFinisher(sessionId, card.exerciseId);
      if (!r.ok) onError(`${r.error}. The finisher wasn't logged; try Mark done again.`);
    });
  }

  return (
    <li>
      <div className="flex min-h-16 items-center gap-3 pl-4 pr-2">
        <MuscleIcon group={card.muscleGroup} className={`shrink-0 ${done ? "text-done" : "text-muted"}`} />
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-w-0 flex-1 py-2 text-left">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">{card.name}</span>
            <span className="shrink-0 text-[11px] font-medium text-muted">finisher</span>
          </span>
          <span className={`flex items-center gap-1 truncate text-sm ${done ? "font-medium text-done" : "text-muted"}`}>
            {done ? <CheckIcon size={14} strokeWidth={2.5} /> : null}
            {done ? `${card.sets[0].reps} min done` : `${ROUNDS} min, ${WORK} s on, ${REST} s off`}
          </span>
        </button>
      </div>

      {open && !done ? (
        <div className="px-4 pb-4">
          {card.cues ? <p className="mb-3 text-xs leading-relaxed text-muted">{card.cues}</p> : null}
          <div className="rounded-xl border border-border p-4 text-center">
            <p className={`text-[13px] font-medium ${phase === "work" ? "text-accent" : "text-muted"}`}>{finished ? "Done" : phase === "work" ? "Work" : "Rest"}</p>
            <p className={`${hero} ${phase === "work" && running ? "text-accent" : ""}`} aria-live="polite">{finished ? "0" : left}</p>
            <p className="mt-1 text-[13px] text-muted">round {round} of {ROUNDS}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-accent motion-safe:transition-[width] motion-safe:duration-150" style={{ width: `${(elapsed / total) * 100}%` }} />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {finished ? (
              <button type="button" disabled={pending} onClick={log} className={`${primary} flex-1`}><CheckIcon strokeWidth={2.5} /> Log it</button>
            ) : (
              <button type="button" onClick={toggle} className={`${primary} flex-1`}>
                {running ? <Pause {...ICON} /> : <Play {...ICON} />} {running ? "Pause" : elapsed > 0 ? "Resume" : "Start"}
              </button>
            )}
            <button type="button" onClick={reset} disabled={elapsed === 0} aria-label="Reset" className={btn}><RotateCcw {...ICON} /></button>
          </div>
          {!finished ? (
            <button type="button" disabled={pending} onClick={log} className="mt-2 min-h-10 text-sm font-medium text-muted active:opacity-70">
              Did it without the timer, mark done
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
