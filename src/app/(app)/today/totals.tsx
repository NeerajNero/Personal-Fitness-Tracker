"use client";

import { useState } from "react";
import { CheckIcon, StepsIcon, StreakIcon } from "@/components/icons";
import { hero, label } from "@/components/ui";
import { n0 } from "@/lib/format";

type Props = {
  totals: { kcal: number; protein: number };
  targets: { kcal: number; kcalMax: number; proteinMin: number; steps: number };
  remaining: { kcal: number; protein: number };
  steps: number | null;
  showSteps: boolean;
  smokeFreeDays: number | null;
};

function Bar({ value, target, tone }: { value: number; target: number; tone: "accent" | "done" | "danger" }) {
  const pct = Math.min(100, (value / target) * 100);
  const fill = { accent: "bg-accent", done: "bg-done", danger: "bg-danger" }[tone];
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
      <div className={`h-full rounded-full motion-safe:transition-[width] motion-safe:duration-150 ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** The two numbers that answer "how am I doing today": kcal left and protein to go. Steps on rest days, the streak if set. */
export function Totals({ totals, targets, remaining, steps, showSteps, smokeFreeDays }: Props) {
  const over = totals.kcal > targets.kcalMax;
  const proteinDone = remaining.protein <= 0;
  // Celebrate only the moment protein is completed on this screen, not every time the page opens already done.
  const [doneAtMount] = useState(proteinDone);
  const celebrate = proteinDone && !doneAtMount;

  return (
    <section className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className={label}>{over ? "kcal over" : "kcal left"}</p>
          <p className={`${hero} mt-1 ${over ? "text-danger" : ""}`}>{n0(Math.abs(remaining.kcal))}</p>
          <p className="mt-1 text-[13px] text-muted">{n0(totals.kcal)} of {n0(targets.kcal)} eaten</p>
          <Bar value={totals.kcal} target={targets.kcal} tone={over ? "danger" : "accent"} />
        </div>
        <div>
          <p className={label}>{proteinDone ? "protein done" : "protein to go"}</p>
          <p className={`${hero} mt-1 flex items-center gap-2 ${proteinDone ? "text-done" : ""}`}>
            {proteinDone ? <CheckIcon size={30} strokeWidth={2.5} className={celebrate ? "celebrate" : undefined} /> : null}
            {proteinDone ? n0(totals.protein) : n0(remaining.protein)}
            <span className="text-xl font-semibold text-muted">g</span>
          </p>
          <p className="mt-1 text-[13px] text-muted">{n0(totals.protein)} of {targets.proteinMin} g</p>
          <Bar value={totals.protein} target={targets.proteinMin} tone={proteinDone ? "done" : "accent"} />
        </div>
      </div>
      {showSteps || smokeFreeDays !== null ? (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
          {showSteps ? (
            <span className={`flex items-center gap-1.5 ${(steps ?? 0) >= targets.steps ? "text-done" : ""}`}>
              <StepsIcon /> {n0(steps ?? 0)} of {n0(targets.steps)} steps
            </span>
          ) : null}
          {smokeFreeDays !== null ? (
            <span className="flex items-center gap-1.5"><StreakIcon /> {smokeFreeDays} days smoke-free</span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
