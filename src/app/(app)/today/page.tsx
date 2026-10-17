import type { Metadata } from "next";
import { addDays, formatDayLabel, isValidIsoDate, todayIST } from "@/lib/dates";
import Link from "next/link";
import { DayPicker } from "@/components/day-picker";
import { listCardio } from "@/lib/activities";
import { cardioDayLine, cardioSummary } from "@/lib/cardio";
import { listFoodLog, listFoods } from "@/lib/food";
import { pickerTypes } from "@/lib/routine";
import { listWorkoutTypes, sessionProgress } from "@/lib/training";
import { getDayState } from "@/lib/rules/dayState";
import { DateHeader } from "@/components/date-header";
import { FoodSection } from "./food-section";
import { MetricInputs } from "./metric-inputs";
import { CardioLine } from "./cardio-line";
import { Totals } from "./totals";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const { d } = await searchParams;
  const today = todayIST();
  const date = typeof d === "string" && isValidIsoDate(d) && d <= today ? d : today;

  const [state, entries, foodList, types, cardio] = await Promise.all([
    getDayState(date),
    listFoodLog(date),
    listFoods(),
    listWorkoutTypes({ includeArchived: true }),
    listCardio(date),
  ]);
  const progress = state.flags.sessionId ? await sessionProgress(state.flags.sessionId) : null;
  const plan = state.dayPlan;
  const trainHref = date === today ? "/train" : `/train?d=${date}`;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <DateHeader
        basePath="/today"
        date={date}
        isToday={date === today}
        label={formatDayLabel(date)}
        prev={addDays(date, -1)}
        next={date < today ? addDays(date, 1) : null}
      />

      <DayPicker
        key={`plan-${date}`}
        date={date}
        plan={plan}
        nextUpId={state.nextUp?.typeId ?? null}
        types={pickerTypes(types, state.daysSince)}
        summary={
          plan.kind === "rest" ? (
            <span className="font-medium">🛌 Rest day</span>
          ) : (
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold">{plan.typeName ?? "Custom"}</span>
              {progress ? <span className="text-sm text-muted">{progress.logged}/{progress.total} logged</span> : null}
              <Link href={trainHref} className="text-sm font-medium text-accent">
                Open Train
              </Link>
            </span>
          )
        }
      />

      <CardioLine
        key={`cardio-${date}`}
        date={date}
        href={`${trainHref}#cardio`}
        logged={cardio.length ? cardioDayLine(cardio) : state.cardio.entries ? "incline walk ✓" : null}
        repeat={state.cardio.lastEntry ? cardioSummary(state.cardio.lastEntry) : null}
      />

      <Totals state={state} />

      <MetricInputs key={date} date={date} weightKg={state.metrics.weightKg} steps={state.metrics.steps} />

      <FoodSection
        key={`food-${date}`}
        date={date}
        entries={entries}
        foods={foodList}
        phase={state.targets.phase}
      />
    </div>
  );
}
