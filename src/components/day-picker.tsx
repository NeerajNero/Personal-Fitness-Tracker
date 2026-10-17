"use client";

import { useState, useTransition, type ReactNode } from "react";
import { chooseDay } from "@/app/(app)/day-actions";
import type { DayPlan } from "@/lib/rules/dayState";
import type { PickerType } from "@/lib/routine";
type Choice = { kind: "rest" } | { kind: "custom" } | { kind: "workout"; typeId: number };

const chip = "flex h-12 items-center justify-center rounded-xl border px-3 text-sm font-medium active:opacity-70 disabled:opacity-50";

/**
 * "What's today?" — a button per active workout type (next up highlighted, days since last done) plus Rest;
 * Custom and archived types under ⋯. Collapses to `summary` + Change once the day is chosen.
 */
export function DayPicker({ date, plan, nextUpId, types, summary }: { date: string; plan: DayPlan; nextUpId: number | null; types: PickerType[]; summary?: ReactNode }) {
  const [open, setOpen] = useState(plan.kind === "unset");
  const [more, setMore] = useState(false);
  const [confirm, setConfirm] = useState<{ choice: Choice; setCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const active = types.filter((t) => !t.archived);
  const archived = types.filter((t) => t.archived);

  function pick(choice: Choice, confirmed = false) {
    setError(null);
    start(async () => {
      const r = await chooseDay(date, choice, confirmed);
      if (!r.ok) return setError(r.error);
      if (r.needsConfirm) return setConfirm({ choice, setCount: r.setCount });
      setConfirm(null);
      setMore(false);
      setOpen(false);
    });
  }

  const isCurrent = (c: Choice) =>
    c.kind === plan.kind && (c.kind !== "workout" || c.typeId === plan.typeId);
  const tone = (c: Choice, highlight: boolean) =>
    isCurrent(c) ? "border-accent bg-accent text-accent-fg" : highlight ? "border-accent text-accent bg-accent/10" : "border-border bg-surface";

  if (!open) {
    return (
      <section className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-2">
        <div className="min-w-0 flex-1">{summary}</div>
        <button type="button" onClick={() => setOpen(true)} className="h-10 shrink-0 px-2 text-sm font-medium text-accent active:opacity-70">
          Change
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted">What&apos;s today?</h2>
        <div className="flex gap-1">
          <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} aria-label="Custom and archived types" className="h-9 px-2 text-lg text-muted active:opacity-70">
            ⋯
          </button>
          {plan.kind !== "unset" ? (
            <button type="button" onClick={() => setOpen(false)} className="h-9 px-2 text-sm text-muted active:opacity-70">
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {active.map((t) => {
          const c: Choice = { kind: "workout", typeId: t.id };
          return (
            <button key={t.id} type="button" disabled={pending} onClick={() => pick(c)} className={`${chip} flex-col leading-tight ${tone(c, t.id === nextUpId)}`}>
              <span className="truncate">{t.label}</span>
              <span className="text-[11px] font-normal opacity-80">{t.days === null ? "new" : `${t.days}d`}</span>
            </button>
          );
        })}
        <button type="button" disabled={pending} onClick={() => pick({ kind: "rest" })} className={`${chip} ${tone({ kind: "rest" }, false)}`}>
          🛌 Rest
        </button>
      </div>

      {more ? (
        <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border pt-2">
          <button type="button" disabled={pending} onClick={() => pick({ kind: "custom" })} className={`${chip} ${tone({ kind: "custom" }, false)}`}>
            Custom
          </button>
          {archived.map((t) => {
            const c: Choice = { kind: "workout", typeId: t.id };
            return (
              <button key={t.id} type="button" disabled={pending} onClick={() => pick(c)} className={`${chip} text-muted ${tone(c, false)}`}>
                {t.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {confirm ? (
        <div className="mt-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
          <p>
            {confirm.setCount} {confirm.setCount === 1 ? "set is" : "sets are"} already logged for this day. Switch anyway? The sets are kept.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setConfirm(null)} className="h-10 flex-1 rounded-xl border border-border bg-surface text-sm active:opacity-70">
              Cancel
            </button>
            <button type="button" disabled={pending} onClick={() => pick(confirm.choice, true)} className="h-10 flex-1 rounded-xl bg-accent text-sm font-medium text-accent-fg active:opacity-80">
              Switch
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </section>
  );
}
