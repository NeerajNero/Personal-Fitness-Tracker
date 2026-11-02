"use client";

import { useState, useTransition } from "react";
import { chooseDay } from "@/app/(app)/day-actions";
import type { DayPlan } from "@/lib/rules/dayState";
import type { PickerType } from "@/lib/routine";
import { RestIcon } from "./icons";
import { btn, chip, ErrorLine, label, primary } from "./ui";

type Choice = { kind: "rest" } | { kind: "custom" } | { kind: "workout"; typeId: number };

/**
 * "Something else": every active workout type (next up highlighted, days since last done), Rest, and under More the
 * Custom session and archived types. Opened from the workout card; `onDone` closes it.
 */
export function DayPicker({ date, plan, nextUpId, types, onDone }: { date: string; plan: DayPlan; nextUpId: number | null; types: PickerType[]; onDone: () => void }) {
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
      if (!r.ok) return setError(`${r.error}. Try again, or reload the page.`);
      if (r.needsConfirm) return setConfirm({ choice, setCount: r.setCount });
      setConfirm(null);
      onDone();
    });
  }

  const isCurrent = (c: Choice) => c.kind === plan.kind && (c.kind !== "workout" || c.typeId === plan.typeId);
  const tone = (c: Choice, highlight: boolean) =>
    isCurrent(c) ? "border-accent bg-accent text-accent-fg" : highlight ? "border-accent text-accent" : "";

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className={label}>What are you doing today?</h3>
        <button type="button" onClick={onDone} className={`${btn} h-9 px-3 text-xs`}>
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {active.map((t) => {
          const c: Choice = { kind: "workout", typeId: t.id };
          return (
            <button key={t.id} type="button" disabled={pending} onClick={() => pick(c)} className={`${chip} flex-col gap-0 leading-tight ${tone(c, t.id === nextUpId)}`}>
              <span className="truncate">{t.label}</span>
              <span className="text-[11px] font-normal opacity-80">{t.days === null ? "new" : `${t.days} d ago`}</span>
            </button>
          );
        })}
        <button type="button" disabled={pending} onClick={() => pick({ kind: "rest" })} className={`${chip} ${tone({ kind: "rest" }, false)}`}>
          <RestIcon /> Rest
        </button>
      </div>

      {more ? (
        <div className="mt-2 grid grid-cols-3 gap-2">
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
      ) : (
        <button type="button" onClick={() => setMore(true)} className="mt-2 min-h-10 text-sm font-medium text-muted active:opacity-70">
          Custom session{archived.length ? " and archived types" : ""}
        </button>
      )}

      {confirm ? (
        <div className="mt-3 rounded-xl border border-warn/40 p-3 text-sm">
          <p>
            {confirm.setCount} {confirm.setCount === 1 ? "set is" : "sets are"} already logged for this day. Switching keeps them in the new session.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setConfirm(null)} className={`${btn} flex-1`}>
              Keep today as it is
            </button>
            <button type="button" disabled={pending} onClick={() => pick(confirm.choice, true)} className={`${primary} h-11 flex-1 text-sm`}>
              Switch
            </button>
          </div>
        </div>
      ) : null}
      <div className="mt-2"><ErrorLine>{error}</ErrorLine></div>
    </div>
  );
}
