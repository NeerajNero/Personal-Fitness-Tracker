import type { Metadata } from "next";
import { DateHeader } from "@/components/date-header";
import { DayPicker } from "@/components/day-picker";
import { addDays, formatDayLabel, isValidIsoDate, todayIST } from "@/lib/dates";
import { n0 } from "@/lib/format";
import { pickerTypes } from "@/lib/routine";
import { getTrainData } from "@/lib/training";
import { Cardio } from "./cardio";
import { SessionView } from "./session-view";

export const metadata: Metadata = { title: "Train" };

export default async function TrainPage({ searchParams }: PageProps<"/train">) {
  const { d } = await searchParams;
  const today = todayIST();
  const date = typeof d === "string" && isValidIsoDate(d) && d <= today ? d : today;

  const { state, types, cardio, session, allExercises } = await getTrainData(date);
  const plan = state.dayPlan;
  const [lo, hi] = state.targets.stepsRange;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <DateHeader
        basePath="/train"
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
            <>
              <p className="text-xs font-medium text-muted">Rest day</p>
              <h2 className="text-xl font-semibold">
                Walk {n0(lo)}–{n0(hi)} steps
              </h2>
            </>
          ) : (
            <h2 className="truncate text-2xl font-semibold">{session?.typeName ?? "Custom workout"}</h2>
          )
        }
      />

      {session ? <SessionView key={session.id} session={session} allExercises={allExercises} /> : null}

      <Cardio key={`cardio-${date}`} date={date} entries={cardio} last={state.cardio.lastEntry} />
    </div>
  );
}
