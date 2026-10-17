"use client";

import { useActionState, useState, useTransition } from "react";
import type { Settings } from "@/db/schema";
import { saveBodyStats, saveSmokeFreeSince, type FormState } from "./actions";
import { Card, Field, input, primary, Status } from "./ui";

export function BodyStatsForm({ s, today }: { s: Settings; today: string }) {
  const [saved, setSaved] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const r = await saveBodyStats(prev, fd);
    if (r?.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
    return r;
  }, null);
  const fe = state?.fieldErrors ?? {};

  const [smokeSaved, setSmokeSaved] = useState(false);
  const [smokeError, setSmokeError] = useState<string | null>(null);
  const [, start] = useTransition();
  function saveSmoke(value: string) {
    if (value === (s.smokeFreeSince ?? "")) return;
    setSmokeError(null);
    start(async () => {
      const r = await saveSmokeFreeSince(value);
      if (r.ok) {
        setSmokeSaved(true);
        setTimeout(() => setSmokeSaved(false), 1500);
      } else setSmokeError(r.error);
    });
  }

  return (
    <Card title="Body & habits" sub="Same fields as onboarding." collapsible defaultOpen={false}>
      <form action={action} className="grid grid-cols-2 gap-2">
        <Field label="Weight (kg)" error={fe.weightKg}><input name="weightKg" type="number" inputMode="decimal" step="0.1" defaultValue={s.weightKg ?? ""} required className={input} /></Field>
        <Field label="Height (cm)" error={fe.heightCm}><input name="heightCm" type="number" inputMode="decimal" step="0.5" defaultValue={s.heightCm ?? ""} required className={input} /></Field>
        <Field label="Age" error={fe.age}><input name="age" type="number" inputMode="numeric" defaultValue={s.age ?? ""} required className={input} /></Field>
        <Field label="Sex" error={fe.sex}>
          <select name="sex" defaultValue={s.sex ?? ""} required className={input}>
            <option value="" disabled>—</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </Field>
        <button type="submit" disabled={pending} className={`${primary} col-span-2`}>{pending ? "Saving…" : "Save body stats"}</button>
        <div className="col-span-2"><Status saved={saved} error={state && !state.ok ? (state.error ?? null) : null} /></div>
      </form>

      <Field label="Smoke-free since (leave empty to hide the counter)" className="mt-2">
        <input type="date" defaultValue={s.smokeFreeSince ?? ""} max={today} onBlur={(e) => saveSmoke(e.target.value)} className={input} />
      </Field>
      <Status saved={smokeSaved} error={smokeError} />
    </Card>
  );
}
