"use client";

import { useActionState, useState } from "react";
import { EQUIPMENT, EQUIPMENT_LABEL, GOAL_KEYS, GOALS } from "@/lib/targets";
import { completeOnboarding, type OnboardingState } from "./actions";

const inputCls = "h-14 w-full rounded-xl border border-border bg-surface px-4 text-lg outline-none focus:border-accent";
const chipCls = "flex min-h-14 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface px-3 text-center text-base has-checked:border-accent has-checked:text-accent";

export function OnboardingForm() {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, null);
  const [location, setLocation] = useState<"gym" | "home">("gym");
  const err = state?.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Weight (kg)" error={err.weightKg}>
          <input name="weightKg" type="number" inputMode="decimal" step="0.1" min={30} max={300} required className={inputCls} />
        </Field>
        <Field label="Height (cm)" error={err.heightCm}>
          <input name="heightCm" type="number" inputMode="decimal" step="0.5" min={120} max={250} required className={inputCls} />
        </Field>
        <Field label="Age" error={err.age}>
          <input name="age" type="number" inputMode="numeric" step="1" min={13} max={100} required className={inputCls} />
        </Field>
        <Field label="Sex" error={err.sex}>
          <div className="grid grid-cols-2 gap-2">
            {(["male", "female"] as const).map((v) => (
              <label key={v} className={`${chipCls} capitalize`}>
                <input type="radio" name="sex" value={v} required className="sr-only" />
                {v}
              </label>
            ))}
          </div>
        </Field>
      </div>

      <Field label="Goal" error={err.goal}>
        <div className="flex flex-col gap-2">
          {GOAL_KEYS.map((g) => (
            <label key={g} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 has-checked:border-accent">
              <input type="radio" name="goal" value={g} defaultChecked={g === "recomp"} required className="accent-accent" />
              <span>
                <span className="block font-medium">{GOALS[g].label}</span>
                <span className="block text-sm text-muted">{GOALS[g].blurb}</span>
              </span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Where do you train?" error={err.trainingLocation}>
        <div className="grid grid-cols-2 gap-2">
          {(["gym", "home"] as const).map((v) => (
            <label key={v} className={`${chipCls} capitalize`}>
              <input type="radio" name="trainingLocation" value={v} checked={location === v} onChange={() => setLocation(v)} className="sr-only" />
              {v}
            </label>
          ))}
        </div>
      </Field>

      {location === "home" ? (
        <Field label="Equipment at home" error={err.equipment}>
          <div className="grid grid-cols-2 gap-2">
            {EQUIPMENT.map((e) => (
              <label key={e} className={chipCls}>
                <input type="checkbox" name="equipment" value={e} className="sr-only" />
                {EQUIPMENT_LABEL[e]}
              </label>
            ))}
          </div>
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Days per week" error={err.daysPerWeek}>
          <input name="daysPerWeek" type="number" inputMode="numeric" step="1" min={1} max={7} defaultValue={4} required className={inputCls} />
        </Field>
        <Field label="Minutes per session" error={err.sessionMinutes}>
          <input name="sessionMinutes" type="number" inputMode="numeric" step="5" min={15} max={180} defaultValue={60} required className={inputCls} />
        </Field>
      </div>

      {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}

      <button type="submit" disabled={pending} className="mt-2 h-14 rounded-xl bg-accent text-lg font-medium text-accent-fg disabled:opacity-60 active:opacity-80">
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      {children}
      {error ? <span className="text-sm text-danger">{error}</span> : null}
    </label>
  );
}
