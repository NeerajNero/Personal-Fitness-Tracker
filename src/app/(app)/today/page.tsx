import type { Metadata } from "next";
import { addDays, formatDayLabel, isValidIsoDate, todayIST } from "@/lib/dates";
import { listFoodLog, listFoods } from "@/lib/food";
import { getDayState } from "@/lib/rules/dayState";
import { DateHeader } from "@/components/date-header";
import { FoodSection } from "./food-section";
import { MetricInputs } from "./metric-inputs";
import { Totals } from "./totals";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const { d } = await searchParams;
  const today = todayIST();
  const date = typeof d === "string" && isValidIsoDate(d) && d <= today ? d : today;

  const [state, entries, foodList] = await Promise.all([getDayState(date), listFoodLog(date), listFoods()]);

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
