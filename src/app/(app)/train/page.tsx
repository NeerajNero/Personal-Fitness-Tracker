import type { Metadata } from "next";
import { DateHeader } from "@/components/date-header";
import { WorkoutCard } from "@/components/workout-card";
import { addDays, formatDayLabel, isValidIsoDate, todayIST } from "@/lib/dates";
import { pickerTypes } from "@/lib/routine";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { getTrainData } from "@/lib/training";
import { loadWorkoutCard } from "@/lib/workout-card";
import { Cardio } from "./cardio";
import { SessionView } from "./session-view";

export const metadata: Metadata = { title: "Train" };

export default async function TrainPage({ searchParams }: PageProps<"/train">) {
  const { d } = await searchParams;
  const today = todayIST();
  const date = typeof d === "string" && isValidIsoDate(d) && d <= today ? d : today;

  const userId = await requireUser();
  const [settings, { state, types, cardio, session, allExercises }] = await Promise.all([getSettings(userId), getTrainData(userId, date)]);
  const card = await loadWorkoutCard(userId, date, state, settings);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <DateHeader basePath="/train" date={date} isToday={date === today} label={formatDayLabel(date)} prev={addDays(date, -1)} next={date < today ? addDays(date, 1) : null} />

      <WorkoutCard key={`plan-${date}`} date={date} data={card} plan={state.dayPlan} nextUpId={state.nextUp?.typeId ?? null} types={pickerTypes(types, state.daysSince)} trainHref="/train" onTrain />

      {session ? <SessionView key={session.id} session={session} allExercises={allExercises} /> : null}

      <Cardio key={`cardio-${date}`} date={date} entries={cardio} last={state.cardio.lastEntry} />
    </div>
  );
}
