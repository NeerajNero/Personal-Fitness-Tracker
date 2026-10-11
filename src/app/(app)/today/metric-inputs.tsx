"use client";

import { useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";
import { saveSteps, saveWeight } from "./actions";

type Status = "idle" | "saving" | "saved" | "error";

function Field({
  label,
  unit,
  initial,
  step,
  inputMode,
  onSave,
}: {
  label: string;
  unit: string;
  initial: string;
  step: string;
  inputMode: "decimal" | "numeric";
  onSave: (raw: string) => Promise<ActionResult>;
}) {
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
        setError(r.error);
        setStatus("error");
      }
    });
  }

  return (
    <label className="flex flex-1 flex-col gap-1 rounded-2xl border border-border bg-surface p-3">
      <span className="flex items-center justify-between text-xs font-medium text-muted">
        {label}
        <span aria-live="polite" className="text-sm">
          {status === "saving" ? <span className="text-muted">…</span> : null}
          {status === "saved" ? <span className="text-accent">✓</span> : null}
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
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="—"
          className={`w-full bg-transparent text-3xl font-semibold tabular-nums outline-none placeholder:text-border ${
            status === "error" ? "text-danger" : ""
          }`}
        />
        <span className="text-sm text-muted">{unit}</span>
      </span>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </label>
  );
}

export function MetricInputs({ date, weightKg, steps }: { date: string; weightKg: number | null; steps: number | null }) {
  return (
    <section className="flex gap-3">
      <Field
        label="Weight"
        unit="kg"
        initial={weightKg === null ? "" : weightKg.toFixed(1)}
        step="0.1"
        inputMode="decimal"
        onSave={(raw) => saveWeight(date, raw)}
      />
      <Field
        label="Steps"
        unit=""
        initial={steps === null ? "" : String(steps)}
        step="1"
        inputMode="numeric"
        onSave={(raw) => saveSteps(date, raw)}
      />
    </section>
  );
}
