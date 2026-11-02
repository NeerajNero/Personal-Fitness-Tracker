import type { Metadata } from "next";
import { addDays, formatDayLabel, isValidIsoDate, todayIST } from "@/lib/dates";
import { DateHeader } from "@/components/date-header";
import { WorkoutCard } from "@/components/workout-card";
import { listCardio } from "@/lib/activities";
import { cardioDayLine, cardioSummary } from "@/lib/cardio";
import { listFoodLog, listFoods } from "@/lib/food";
import { pickerTypes } from "@/lib/routine";
import { getDayState } from "@/lib/rules/dayState";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { listWorkoutTypes } from "@/lib/training";
import { loadWorkoutCard } from "@/lib/workout-card";
import { CardioLine } from "./cardio-line";
import { FoodSection } from "./food-section";
import { MetricInputs } from "./metric-inputs";
import { Totals } from "./totals";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const { d } = await searchParams;
  const today = todayIST();
  const date = typeof d === "string" && isValidIsoDate(d) && d <= today ? d : today;

  const userId = await requireUser();
  const settings = await getSettings(userId);
  const [state, entries, foodList, types, cardio] = await Promise.all([
    getDayState(userId, date, { settings }),
    listFoodLog(userId, date),
    listFoods(userId),
    listWorkoutTypes(userId, { includeArchived: true }),
    listCardio(userId, date),
  ]);
  const card = await loadWorkoutCard(userId, date, state, settings);
  const trainHref = date === today ? "/train" : `/train?d=${date}`;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <DateHeader basePath="/today" date={date} isToday={date === today} label={formatDayLabel(date)} prev={addDays(date, -1)} next={date < today ? addDays(date, 1) : null} />

      <WorkoutCard key={`plan-${date}`} date={date} data={card} plan={state.dayPlan} nextUpId={state.nextUp?.typeId ?? null} types={pickerTypes(types, state.daysSince)} trainHref={trainHref} onTrain={false} />

      <Totals
        totals={state.totals}
        targets={{ kcal: state.targets.kcal, kcalMax: state.targets.kcalRange[1], proteinMin: state.targets.proteinMin, steps: state.targets.steps }}
        remaining={state.remaining}
        steps={state.metrics.steps}
        showSteps={state.dayPlan.kind === "rest" || state.dayPlan.kind === "unset"}
        smokeFreeDays={state.smokeFreeDays}
      />

      <MetricInputs key={date} date={date} weightKg={state.metrics.weightKg} steps={state.metrics.steps} />

      <CardioLine
        key={`cardio-${date}`}
        date={date}
        href={`${trainHref}#cardio`}
        logged={cardio.length ? cardioDayLine(cardio) : state.cardio.entries ? "incline walk" : null}
        repeat={state.cardio.lastEntry ? cardioSummary(state.cardio.lastEntry) : null}
      />

      <FoodSection key={`food-${date}`} date={date} entries={entries} foods={foodList} phase={state.targets.phase} />
    </div>
  );
}
