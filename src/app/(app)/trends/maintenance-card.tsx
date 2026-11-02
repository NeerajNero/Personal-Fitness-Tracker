"use client";

import { useState, useTransition } from "react";
import type { Goal } from "@/db/schema";
import type { Maintenance } from "@/lib/metrics/trends";
import { GOALS } from "@/lib/targets";
import { btn, primary } from "@/components/ui";
import { applyKcalTarget } from "./actions";
import { Section } from "./section";

export function MaintenanceCard({ data, currentTarget, goal }: { data: Maintenance; currentTarget: number; goal: Goal }) {
  const delta = GOALS[goal].kcalDelta;
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const same = data.suggestedTarget === currentTarget;

  function apply() {
    setError(null);
    start(async () => {
      const r = await applyKcalTarget(data.suggestedTarget);
      if (!r.ok) setError(`${r.error}. The target wasn't changed; try again from Settings if it keeps failing.`);
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
          <p className="text-xs text-muted">Suggested target ({delta > 0 ? "+" : ""}{delta})</p>
          <p className="text-2xl font-semibold tabular-nums">{data.suggestedTarget.toLocaleString("en-IN")} <span className="text-sm font-normal text-muted">kcal</span></p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Avg intake {data.avgIntake.toLocaleString("en-IN")} kcal, weight {data.weightChangeKg > 0 ? "+" : ""}{data.weightChangeKg} kg over {data.window.days} days
        ({data.window.daysWithBoth} days with both logged). Current target {currentTarget.toLocaleString("en-IN")}.
      </p>

      {same ? (
        <p className="mt-3 text-sm text-done">Your target already matches the suggestion.</p>
      ) : armed ? (
        <div className="mt-3 flex items-center gap-2">
          <span className="flex-1 text-sm">Set {data.suggestedTarget.toLocaleString("en-IN")} kcal, give or take 25, as the daily target?</span>
          <button type="button" disabled={pending} onClick={() => setArmed(false)} className={btn}>
            Cancel
          </button>
          <button type="button" disabled={pending} onClick={apply} className={`${primary} h-11 px-4 text-sm`}>
            {pending ? "Saving" : "Confirm"}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setArmed(true)} className={`${btn} mt-3 w-full`}>
          Use this target
        </button>
      )}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </Section>
  );
}
