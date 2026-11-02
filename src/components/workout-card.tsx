"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chooseDay } from "@/app/(app)/day-actions";
import { n0 } from "@/lib/format";
import type { DayPlan } from "@/lib/rules/dayState";
import type { PickerType } from "@/lib/routine";
import type { WorkoutCardData } from "@/lib/workout-card";
import { DayPicker } from "./day-picker";
import { CheckIcon, LiftIcon, MuscleIcon, RestIcon, StepsIcon } from "./icons";
import { big, ErrorLine, hero, label, link, primary } from "./ui";

const fmtW = (w: number) => (w <= 0 ? "Bodyweight" : `${Number.isInteger(w) ? w : w.toFixed(1).replace(/\.0$/, "")} kg`);

type Props = { date: string; data: WorkoutCardData; plan: DayPlan; nextUpId: number | null; types: PickerType[]; trainHref: string; onTrain: boolean };

/**
 * Today's workout, at the top of Today and Train. One primary action (Start, or Open from Today); "Something else"
 * opens the full picker (other types, rest, custom). Numbers are the hero: the last top set, the step count.
 */
export function WorkoutCard({ date, data, plan, nextUpId, types, trainHref, onTrain }: Props) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function startWorkout(typeId: number) {
    setError(null);
    start(async () => {
      const r = await chooseDay(date, { kind: "workout", typeId });
      if (!r.ok) return setError(`${r.error}. Try again, or pick the day under Something else.`);
      if (!onTrain) router.push(trainHref);
    });
  }

  const somethingElse = picking ? null : (
    <button type="button" onClick={() => setPicking(true)} className={`${link} min-h-10 text-muted`}>
      Something else
    </button>
  );
  const picker = picking ? <DayPicker date={date} plan={plan} nextUpId={nextUpId} types={types} onDone={() => setPicking(false)} /> : null;

  if (data.kind === "setup") {
    return (
      <section className="rounded-2xl border border-border bg-surface p-4">
        <p className="flex items-center gap-2 font-semibold"><LiftIcon className="text-muted" /> {data.home ? "Set up your home plan" : "Add a workout type"}</p>
        <p className="mt-1 text-sm text-muted">
          {data.home
            ? "Your workout types live in Settings. Bodyweight plans from your equipment arrive in the next release; until then, add a type by hand."
            : "You have no active workout types, so there is nothing to rotate. Add one in Settings, or restore an archived one."}
        </p>
        <div className="mt-3 flex items-center gap-4">
          <Link href="/settings#workout-types" className={primary}>Open Settings</Link>
          {somethingElse}
        </div>
        {picker}
      </section>
    );
  }

  if (data.kind === "rest") {
    const [lo] = data.stepsRange;
    const hit = data.steps !== null && data.steps >= lo;
    return (
      <section className="rounded-2xl border border-border bg-surface p-4">
        <p className={`flex items-center gap-2 ${label}`}><RestIcon /> Rest day</p>
        <p className={`mt-2 flex items-center gap-3 ${hero} ${hit ? "text-done" : ""}`}>
          {hit ? <CheckIcon size={32} strokeWidth={2.5} className="celebrate" /> : <StepsIcon size={28} className="text-muted" />}
          {n0(data.steps ?? lo)}
        </p>
        <p className="mt-1 text-sm text-muted">{data.steps === null ? `steps to walk today, up to ${n0(data.stepsRange[1])}` : hit ? "steps, target met" : `of ${n0(lo)} steps so far`}</p>
        <p className="mt-3 text-sm">{data.suggestion}</p>
        <div className="mt-2">{somethingElse}</div>
        {picker}
      </section>
    );
  }

  if (data.kind === "active") {
    const done = data.total > 0 && data.logged === data.total;
    return (
      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center gap-3">
          {data.group ? <MuscleIcon group={data.group} size={28} className={done ? "text-done" : "text-muted"} /> : <LiftIcon size={28} className="text-muted" />}
          <div className="min-w-0 flex-1">
            <h2 className={`${big} truncate`}>{data.typeName}</h2>
            <p className={`mt-1 text-sm ${done ? "font-medium text-done" : "text-muted"}`}>
              {done ? `Done, all ${data.total} logged` : `${data.logged} of ${data.total} done`}
            </p>
          </div>
          {!onTrain ? <Link href={trainHref} className={`${primary} h-11 px-5`}>{done ? "Open" : "Continue"}</Link> : null}
        </div>
        <div className="mt-2">{somethingElse}</div>
        {picker}
      </section>
    );
  }

  const ago = data.daysSince === null ? "First time." : data.daysSince === 0 ? "Last done today." : data.daysSince === 1 ? "Last done yesterday." : `Last done ${data.daysSince} days ago.`;
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <p className={label}>Next up</p>
      <div className="mt-1 flex items-center gap-3">
        <MuscleIcon group={data.group} size={30} className="text-accent" />
        <h2 className={`${big} truncate`}>{data.typeName}</h2>
      </div>
      <p className="mt-2 text-sm text-muted">
        {data.exerciseCount} {data.exerciseCount === 1 ? "exercise" : "exercises"}, about {data.estMinutes} min. {ago}
      </p>
      {data.topSets.length ? (
        <dl className="mt-3 grid grid-cols-2 gap-3">
          {data.topSets.map((t) => (
            <div key={t.name} className="min-w-0">
              <dt className={`truncate ${label}`}>{t.name}</dt>
              <dd className="text-xl font-bold leading-tight">{fmtW(t.weightKg)} × {t.reps}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="mt-4 flex items-center gap-4">
        <button type="button" disabled={pending} onClick={() => startWorkout(data.typeId)} className={`${primary} flex-1`}>
          {pending ? "Starting" : `Start ${data.typeName}`}
        </button>
        {somethingElse}
      </div>
      <div className="mt-2"><ErrorLine>{error}</ErrorLine></div>
      {picker}
    </section>
  );
}
