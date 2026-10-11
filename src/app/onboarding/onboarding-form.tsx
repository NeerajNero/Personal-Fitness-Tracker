"use client";

import { useActionState } from "react";
import { completeOnboarding, type OnboardingState } from "./actions";

type Defaults = {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  sex: "male" | "female" | null;
};

const inputCls =
  "h-14 w-full rounded-xl border border-border bg-surface px-4 text-lg outline-none focus:border-accent";

export function OnboardingForm({ defaults }: { defaults: Defaults }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, null);
  const err = state?.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-5">
      <Field label="Weight (kg)" error={err.weightKg}>
        <input name="weightKg" type="number" inputMode="decimal" step="0.1" min={30} max={300} required
          defaultValue={defaults.weightKg ?? ""} className={inputCls} />
      </Field>
      <Field label="Height (cm)" error={err.heightCm}>
        <input name="heightCm" type="number" inputMode="decimal" step="0.5" min={120} max={250} required
          defaultValue={defaults.heightCm ?? ""} className={inputCls} />
      </Field>
      <Field label="Age" error={err.age}>
        <input name="age" type="number" inputMode="numeric" step="1" min={13} max={100} required
          defaultValue={defaults.age ?? ""} className={inputCls} />
      </Field>
      <Field label="Sex" error={err.sex}>
        <div className="grid grid-cols-2 gap-3">
          {(["male", "female"] as const).map((v) => (
            <label key={v}
              className="flex h-14 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface text-lg capitalize has-checked:border-accent has-checked:text-accent">
              <input type="radio" name="sex" value={v} defaultChecked={defaults.sex === v} required className="sr-only" />
              {v}
            </label>
          ))}
        </div>
      </Field>

      {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}

      <button type="submit" disabled={pending}
        className="mt-2 h-14 rounded-xl bg-accent text-lg font-medium text-accent-fg disabled:opacity-60 active:opacity-80">
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
