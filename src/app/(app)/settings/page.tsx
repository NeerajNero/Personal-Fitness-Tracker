import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { signOut } from "@/auth";
import { db } from "@/db";
import { exercises, foods, routineExercises } from "@/db/schema";
import { todayIST } from "@/lib/dates";
import { EXPORT_TABLES } from "@/lib/export-tables";
import { getPhase } from "@/lib/metrics/phase";
import { NUDGE_TOGGLES } from "@/lib/nudges";
import { getSettings } from "@/lib/settings";
import { listExercises, listRoutineDays } from "@/lib/training";
import { BodyStatsForm } from "./body-stats-form";
import { FoodsEditor } from "./foods-editor";
import { NudgeSettings } from "./nudge-settings";
import { PhaseSection } from "./phase-section";
import { RoutineEditor, type RoutineDayView } from "./routine-editor";
import { TargetsForm } from "./targets-form";
import { TelegramCard } from "./telegram-card";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const today = todayIST();
  const [s, allFoods, allExercises, days, re] = await Promise.all([
    getSettings(),
    db.select().from(foods).orderBy(asc(foods.archived), asc(foods.name)),
    listExercises(),
    listRoutineDays(),
    db
      .select({
        routineDayId: routineExercises.routineDayId,
        exerciseId: routineExercises.exerciseId,
        sortOrder: routineExercises.sortOrder,
        targetSets: routineExercises.targetSets,
        targetReps: routineExercises.targetReps,
        name: exercises.name,
        muscleGroup: exercises.muscleGroup,
        cues: exercises.cues,
      })
      .from(routineExercises)
      .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
      .orderBy(asc(routineExercises.routineDayId), asc(routineExercises.sortOrder)),
  ]);

  const routine: RoutineDayView[] = days.map((d) => ({
    id: d.id,
    name: d.name,
    weekday: d.weekday,
    exercises: re.filter((x) => x.routineDayId === d.id).map(({ exerciseId, name, muscleGroup, cues, targetSets, targetReps }) => ({ exerciseId, name, muscleGroup, cues, targetSets, targetReps })),
  }));
  const toggles = Object.fromEntries(NUDGE_TOGGLES.map((k) => [k, s[k]])) as Record<(typeof NUDGE_TOGGLES)[number], boolean>;
  const bot = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <TargetsForm s={s} />
      <PhaseSection s={s} phaseToday={getPhase(today, s)} />
      <BodyStatsForm s={s} today={today} />
      <FoodsEditor foods={allFoods} />
      <RoutineEditor days={routine} allExercises={allExercises} />
      <TelegramCard linked={s.telegramChatId !== null} code={s.telegramLinkCode} bot={bot} />
      <NudgeSettings toggles={toggles} quietStart={s.quietHoursStart.slice(0, 5)} quietEnd={s.quietHoursEnd.slice(0, 5)} dailyCap={s.nudgeDailyCap} />

      <section id="export" className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Export data</h2>
        <p className="mt-1 text-xs text-muted">One CSV per table. Settings is not exported.</p>
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {EXPORT_TABLES.map((t) => (
            <li key={t}>
              <a href={`/api/export/${t}`} download className="flex h-11 items-center justify-between rounded-xl border border-border bg-bg px-3 text-sm font-medium active:opacity-70">
                {t.replace(/_/g, " ")}
                <span aria-hidden className="text-muted">↓</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button type="submit" className="h-12 w-full rounded-xl border border-border bg-surface text-base font-medium text-danger active:opacity-80">
          Sign out
        </button>
      </form>
    </div>
  );
}
