"use client";

import { useState, useTransition } from "react";
import type { NudgeToggle } from "@/lib/nudges";
import { saveDailyCap, saveQuietHours, setNudgeToggle } from "./actions";

type Props = {
  toggles: Record<NudgeToggle, boolean>;
  quietStart: string; // "HH:MM"
  quietEnd: string;
  dailyCap: number;
};

const ROWS: { key: NudgeToggle; label: string; when: string }[] = [
  { key: "nudgeMorningBrief", label: "Morning brief", when: "07:30 · routine + weigh-in" },
  { key: "nudgeLunchCheck", label: "Lunch check", when: "13:30 · if nothing logged since 11:00" },
  { key: "nudgeProteinCheck", label: "Protein check", when: "16:30 · if under 45% of target" },
  { key: "nudgeKcalCheck", label: "Calorie check", when: "20:00 · kcal left for dinner" },
  { key: "nudgeDayClose", label: "Day close", when: "22:00 · summary + what's missing" },
  { key: "nudgeWater", label: "Water reminders", when: "every 2 h, 10:00–20:00" },
  { key: "nudgeWeeklyMeasure", label: "Weekly measure + report", when: "Sunday 19:00 (Monday 08:00 fallback)" },
  { key: "nudgeBudget", label: "Protein budget alert", when: "once a month at 80% before the 24th" },
  { key: "nudgeMilestones", label: "Milestones", when: "phase switch, Dec 10 checkpoint, smoke-free weeks" },
];

export function NudgeSettings({ toggles, quietStart, quietEnd, dailyCap }: Props) {
  const [state, setState] = useState(toggles);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [, start] = useTransition();

  const flash = (what: string) => {
    setSaved(what);
    setTimeout(() => setSaved((s) => (s === what ? null : s)), 1500);
  };

  function toggle(key: NudgeToggle) {
    const next = !state[key];
    setState((s) => ({ ...s, [key]: next }));
    setError(null);
    start(async () => {
      const r = await setNudgeToggle(key, next);
      if (!r.ok) {
        setState((s) => ({ ...s, [key]: !next }));
        setError(r.error);
      }
    });
  }

  function saveHours(form: HTMLFormElement) {
    const fd = new FormData(form);
    start(async () => {
      const r = await saveQuietHours(String(fd.get("start")), String(fd.get("end")));
      if (r.ok) flash("hours");
      else setError(r.error);
    });
  }

  function saveCap(value: string) {
    start(async () => {
      const r = await saveDailyCap(Number(value));
      if (r.ok) flash("cap");
      else setError(r.error);
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Nudges</h2>
      <p className="mt-1 text-xs text-muted">Telegram messages from the scheduler. Times are IST.</p>

      <ul className="mt-3 divide-y divide-border">
        {ROWS.map((r) => (
          <li key={r.key}>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{r.label}</span>
                <span className="block text-xs text-muted">{r.when}</span>
              </span>
              <input type="checkbox" role="switch" checked={state[r.key]} onChange={() => toggle(r.key)} aria-label={r.label} className="peer sr-only" />
              <span className="relative h-7 w-12 shrink-0 rounded-full bg-border transition-colors peer-checked:bg-accent after:absolute after:top-0.5 after:left-0.5 after:size-6 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
            </label>
          </li>
        ))}
      </ul>

      <form
        className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          saveHours(e.currentTarget);
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) saveHours(e.currentTarget);
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-muted">
          Quiet from
          <input name="start" type="time" defaultValue={quietStart} required className="h-12 rounded-xl border border-border bg-bg px-3 text-base text-fg" />
        </label>
        <span className="pb-3 text-muted">→</span>
        <label className="flex flex-col gap-1 text-xs text-muted">
          until
          <input name="end" type="time" defaultValue={quietEnd} required className="h-12 rounded-xl border border-border bg-bg px-3 text-base text-fg" />
        </label>
        <button type="submit" className="sr-only">Save quiet hours</button>
      </form>

      <label className="mt-3 flex items-center justify-between gap-3">
        <span>
          <span className="block font-medium">Daily cap</span>
          <span className="block text-xs text-muted">Max nudges per day</span>
        </span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={20}
          defaultValue={dailyCap}
          onBlur={(e) => {
            if (Number(e.target.value) !== dailyCap) saveCap(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="h-12 w-20 rounded-xl border border-border bg-bg text-center text-lg tabular-nums"
        />
      </label>

      <p className="mt-2 h-4 text-xs" aria-live="polite">
        {saved ? <span className="text-accent">Saved ✓</span> : null}
        {error ? <span className="text-danger">{error}</span> : null}
      </p>
    </section>
  );
}
