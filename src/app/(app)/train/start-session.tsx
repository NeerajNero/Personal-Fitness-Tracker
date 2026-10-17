"use client";

import { useState, useTransition } from "react";
import { ROUTINE_LABEL, type RoutineDayName } from "@/lib/routine";
import { startSession } from "./actions";

type Props = {
  date: string;
  isTrainingDay: boolean;
  routineDayId: number | null;
  routineDayName: RoutineDayName | null;
  routineDays: { id: number; name: RoutineDayName }[];
  preview: string[];
  stepsRange: [number, number];
};

const small = "h-11 flex-1 rounded-xl border border-border bg-bg text-sm font-medium active:opacity-70 disabled:opacity-50";

export function StartSession({ date, isTrainingDay, routineDayId, routineDayName, routineDays, preview, stepsRange }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState(false);
  const label = routineDayName ? ROUTINE_LABEL[routineDayName] : null;

  function go(id: number | null) {
    setError(null);
    start(async () => {
      const r = await startSession(date, id);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      {isTrainingDay && label ? (
        <>
          <p className="text-xs font-medium text-muted">Training day</p>
          <h2 className="text-2xl font-semibold">{label}</h2>
          {preview.length ? <p className="mt-1 text-sm text-muted">{preview.join(" · ")}</p> : null}
          <button
            type="button"
            disabled={pending}
            onClick={() => go(routineDayId)}
            className="mt-4 h-14 w-full rounded-xl bg-accent text-lg font-medium text-accent-fg active:opacity-80 disabled:opacity-60"
          >
            {pending ? "Starting…" : `Start ${label}`}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs font-medium text-muted">Rest day</p>
          <h2 className="text-2xl font-semibold">Walk {stepsRange[0].toLocaleString("en-IN")}–{stepsRange[1].toLocaleString("en-IN")} steps</h2>
        </>
      )}

      {pick ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {routineDays
            .filter((d) => d.id !== routineDayId)
            .map((d) => (
              <button key={d.id} type="button" disabled={pending} onClick={() => go(d.id)} className={small}>
                {ROUTINE_LABEL[d.name]}
              </button>
            ))}
          <button type="button" disabled={pending} onClick={() => go(null)} className={small}>
            Free workout
          </button>
        </div>
      ) : (
        <button type="button" disabled={pending} onClick={() => setPick(true)} className="mt-3 h-10 text-sm text-accent active:opacity-70">
          {isTrainingDay && label ? "Other workout…" : "Train anyway…"}
        </button>
      )}

      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </section>
  );
}
