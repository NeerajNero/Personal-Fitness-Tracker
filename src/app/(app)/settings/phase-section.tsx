"use client";

import { useState, useTransition } from "react";
import type { Settings } from "@/db/schema";
import type { Phase } from "@/lib/metrics/phase";
import { savePhase } from "./actions";
import { Card, Field, input, Status } from "./ui";

type Mode = "auto" | "veg" | "nonveg";

export function PhaseSection({ s, phaseToday }: { s: Settings; phaseToday: Phase }) {
  const [mode, setMode] = useState<Mode>(s.phaseOverride ?? "auto");
  const [switchDate, setSwitchDate] = useState(s.phaseSwitchDate);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function save(next: { mode?: Mode; switchDate?: string }) {
    const m = next.mode ?? mode;
    const d = next.switchDate ?? switchDate;
    setError(null);
    start(async () => {
      const r = await savePhase({ override: m, switchDate: d });
      if (r.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } else setError(r.error);
    });
  }

  return (
    <Card title="Protein phase" sub={`In force today: ${phaseToday === "veg" ? "veg" : "non-veg"}${s.phaseOverride ? " (override)" : " (auto by date)"}`}>
      <div className="grid grid-cols-3 gap-2">
        {(["auto", "veg", "nonveg"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              save({ mode: m });
            }}
            className={`h-12 rounded-xl border text-sm font-medium capitalize ${mode === m ? "border-accent bg-accent/10 text-accent" : "border-border bg-bg"}`}
          >
            {m === "nonveg" ? "Non-veg" : m}
          </button>
        ))}
      </div>
      <Field label="Auto switches to non-veg on" className="mt-3">
        <input
          type="date"
          value={switchDate}
          onChange={(e) => setSwitchDate(e.target.value)}
          onBlur={() => switchDate !== s.phaseSwitchDate && save({ switchDate })}
          className={input}
        />
      </Field>
      <Status saved={saved} error={error} />
    </Card>
  );
}
