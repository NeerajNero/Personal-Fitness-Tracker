"use client";

import { useActionState, useState } from "react";
import type { Settings } from "@/db/schema";
import { GOALS } from "@/lib/targets";
import { saveTargets, type FormState } from "./actions";
import { Card, Field, input, primary, Status } from "./ui";

/** `phased` = the owner's per-phase protein (and `budgets`); everyone else edits one protein range. */
export function TargetsForm({ s, phased, budgets }: { s: Settings; phased: boolean; budgets: boolean }) {
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
  const N = (name: keyof Settings, step = 1) => <input name={name} type="number" inputMode="numeric" step={step} defaultValue={s[name] === null ? "" : String(s[name])} required className={input} />;

  return (
    <Card title="Targets" sub={`${GOALS[s.goal].label} · daily calories, protein, steps${budgets ? " and protein budget" : ""}.`}>
      <form action={action} className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <Field label="kcal min" error={fe.kcalMin}>{N("kcalMin", 5)}</Field>
          <Field label="kcal target" error={fe.kcalTarget}>{N("kcalTarget", 5)}</Field>
          <Field label="kcal max" error={fe.kcalMax}>{N("kcalMax", 5)}</Field>
        </div>
        {phased ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Protein veg min (g)" error={fe.proteinMinVeg}>{N("proteinMinVeg")}</Field>
            <Field label="Protein veg max (g)" error={fe.proteinMaxVeg}>{N("proteinMaxVeg")}</Field>
            <Field label="Protein non-veg min (g)" error={fe.proteinMinNonveg}>{N("proteinMinNonveg")}</Field>
            <Field label="Protein non-veg max (g)" error={fe.proteinMaxNonveg}>{N("proteinMaxNonveg")}</Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Protein min (g)" error={fe.proteinMin}>{N("proteinMin")}</Field>
            <Field label="Protein max (g)" error={fe.proteinMax}>{N("proteinMax")}</Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Steps min (rest days)" error={fe.stepsMin}>{N("stepsMin", 500)}</Field>
          <Field label="Steps max" error={fe.stepsMax}>{N("stepsMax", 500)}</Field>
          {budgets ? (
            <>
              <Field label="Budget veg (₹/month)" error={fe.budgetVegInr}>{N("budgetVegInr", 100)}</Field>
              <Field label="Budget non-veg (₹/month)" error={fe.budgetNonvegInr}>{N("budgetNonvegInr", 100)}</Field>
            </>
          ) : null}
        </div>
        <button type="submit" disabled={pending} className={primary}>{pending ? "Saving…" : "Save targets"}</button>
        <Status saved={saved} error={state && !state.ok ? (state.error ?? null) : null} />
      </form>
    </Card>
  );
}
