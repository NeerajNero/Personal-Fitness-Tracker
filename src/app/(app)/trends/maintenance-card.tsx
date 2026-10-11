"use client";

import { useState, useTransition } from "react";
import type { Maintenance } from "@/lib/metrics/trends";
import { applyKcalTarget } from "./actions";
import { Section } from "./section";

export function MaintenanceCard({ data, currentTarget }: { data: Maintenance; currentTarget: number }) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const same = data.suggestedTarget === currentTarget;

  function apply() {
    setError(null);
    start(async () => {
      const r = await applyKcalTarget(data.suggestedTarget);
      if (!r.ok) setError(r.error);
      setArmed(false);
    });
  }

  return (
    <Section title="Estimated maintenance">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted">Maintenance</p>
          <p className="text-2xl font-semibold tabular-nums">{data.tdee.toLocaleString("en-IN")} <span className="text-sm font-normal text-muted">kcal</span></p>
        </div>
        <div>
          <p className="text-xs text-muted">Suggested target</p>
          <p className="text-2xl font-semibold tabular-nums">{data.suggestedTarget.toLocaleString("en-IN")} <span className="text-sm font-normal text-muted">kcal</span></p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Avg intake {data.avgIntake.toLocaleString("en-IN")} kcal, weight {data.weightChangeKg > 0 ? "+" : ""}{data.weightChangeKg} kg over {data.window.days} days
        ({data.window.daysWithBoth} days with both logged). Current target {currentTarget.toLocaleString("en-IN")}.
      </p>

      {same ? (
        <p className="mt-3 text-sm text-accent">Your target already matches the suggestion.</p>
      ) : armed ? (
        <div className="mt-3 flex items-center gap-2">
          <span className="flex-1 text-sm">Set {data.suggestedTarget.toLocaleString("en-IN")} kcal (±25) as the daily target?</span>
          <button type="button" disabled={pending} onClick={() => setArmed(false)} className="h-11 rounded-xl border border-border bg-bg px-3 text-sm">
            Cancel
          </button>
          <button type="button" disabled={pending} onClick={apply} className="h-11 rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg disabled:opacity-60">
            {pending ? "Saving…" : "Confirm"}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setArmed(true)} className="mt-3 h-12 w-full rounded-xl border border-border bg-bg text-sm font-medium active:opacity-70">
          Apply target
        </button>
      )}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </Section>
  );
}
