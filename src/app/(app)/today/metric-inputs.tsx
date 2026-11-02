"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { StepsIcon, WeighIcon } from "@/components/icons";
import { label } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";
import { saveSteps, saveWeight } from "./actions";

type Status = "idle" | "saving" | "saved" | "error";

function Field({ icon, name, unit, initial, step, inputMode, onSave }: { icon: ReactNode; name: string; unit: string; initial: string; step: string; inputMode: "decimal" | "numeric"; onSave: (raw: string) => Promise<ActionResult> }) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef(initial);
  const [, startTransition] = useTransition();

  function commit() {
    if (value === lastSaved.current) return;
    setStatus("saving");
    setError(null);
    startTransition(async () => {
      const r = await onSave(value);
      if (r.ok) {
        lastSaved.current = value;
        setStatus("saved");
        setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1500);
      } else {
        setError(`${r.error}. Check the number and try again.`);
        setStatus("error");
      }
    });
  }

  return (
    <label className="flex flex-1 flex-col gap-1 rounded-2xl border border-border bg-surface px-3 py-2">
      <span className={`flex items-center justify-between ${label}`}>
        <span className="flex items-center gap-1.5">{icon} {name}</span>
        <span aria-live="polite" className="text-xs">
          {status === "saving" ? "Saving" : status === "saved" ? <span className="text-done">Saved</span> : null}
        </span>
      </span>
      <span className="flex items-baseline gap-1">
        <input
          type="number"
          inputMode={inputMode}
          step={step}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder="—"
          className={`w-full bg-transparent text-[1.75rem] font-bold leading-none outline-none placeholder:text-border ${status === "error" ? "text-danger" : ""}`}
        />
        {unit ? <span className="text-sm text-muted">{unit}</span> : null}
      </span>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </label>
  );
}

export function MetricInputs({ date, weightKg, steps }: { date: string; weightKg: number | null; steps: number | null }) {
  return (
    <section className="flex gap-3">
      <Field icon={<WeighIcon />} name="Weight" unit="kg" initial={weightKg === null ? "" : weightKg.toFixed(1)} step="0.1" inputMode="decimal" onSave={(raw) => saveWeight(date, raw)} />
      <Field icon={<StepsIcon />} name="Steps" unit="" initial={steps === null ? "" : String(steps)} step="1" inputMode="numeric" onSave={(raw) => saveSteps(date, raw)} />
    </section>
  );
}
