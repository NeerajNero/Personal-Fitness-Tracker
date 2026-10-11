"use client";

import { useActionState, useState } from "react";
import type { Settings } from "@/db/schema";
import { saveTargets, type FormState } from "./actions";
import { Card, Field, input, primary, Status } from "./ui";

export function TargetsForm({ s }: { s: Settings }) {
  const [saved, setSaved] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const r = await saveTargets(prev, fd);
    if (r?.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
    return r;
  }, null);
  const fe = state?.fieldErrors ?? {};
  const N = (name: keyof Settings, step = 1) => <input name={name} type="number" inputMode="numeric" step={step} defaultValue={String(s[name])} required className={input} />;

  return (
    <Card title="Targets" sub="Daily calories, protein per phase, steps and protein budget.">
      <form action={action} className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <Field label="kcal min" error={fe.kcalMin}>{N("kcalMin", 5)}</Field>
          <Field label="kcal target" error={fe.kcalTarget}>{N("kcalTarget", 5)}</Field>
          <Field label="kcal max" error={fe.kcalMax}>{N("kcalMax", 5)}</Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Protein veg min (g)" error={fe.proteinMinVeg}>{N("proteinMinVeg")}</Field>
          <Field label="Protein veg max (g)" error={fe.proteinMaxVeg}>{N("proteinMaxVeg")}</Field>
          <Field label="Protein non-veg min (g)" error={fe.proteinMinNonveg}>{N("proteinMinNonveg")}</Field>
          <Field label="Protein non-veg max (g)" error={fe.proteinMaxNonveg}>{N("proteinMaxNonveg")}</Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Steps min (rest days)" error={fe.stepsMin}>{N("stepsMin", 500)}</Field>
          <Field label="Steps max" error={fe.stepsMax}>{N("stepsMax", 500)}</Field>
          <Field label="Budget veg (₹/month)" error={fe.budgetVegInr}>{N("budgetVegInr", 100)}</Field>
          <Field label="Budget non-veg (₹/month)" error={fe.budgetNonvegInr}>{N("budgetNonvegInr", 100)}</Field>
        </div>
        <button type="submit" disabled={pending} className={primary}>{pending ? "Saving…" : "Save targets"}</button>
        <Status saved={saved} error={state && !state.ok ? (state.error ?? null) : null} />
      </form>
    </Card>
  );
}
