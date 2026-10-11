import type { Metadata } from "next";
import { DateHeader } from "@/components/date-header";
import { addDays, formatDayLabel, isValidIsoDate, todayIST } from "@/lib/dates";
import { getTrainData } from "@/lib/training";
import { Activities } from "./activities";
import { SessionView } from "./session-view";
import { StartSession } from "./start-session";

export const metadata: Metadata = { title: "Train" };

export default async function TrainPage({ searchParams }: PageProps<"/train">) {
  const { d } = await searchParams;
  const today = todayIST();
  const date = typeof d === "string" && isValidIsoDate(d) && d <= today ? d : today;

  const { state, routineDays, activities, session, preview, allExercises } = await getTrainData(date);

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

      {session ? (
        <SessionView key={session.id} session={session} allExercises={allExercises} />
      ) : (
        <StartSession
          key={`start-${date}`}
          date={date}
          isTrainingDay={state.flags.isTrainingDay}
          routineDayId={state.flags.routineDayId}
          routineDayName={state.flags.routineDayName}
          routineDays={routineDays}
          preview={preview}
          stepsRange={state.targets.stepsRange}
        />
      )}

      <Activities key={`act-${date}`} date={date} activities={activities} />
    </div>
  );
}
