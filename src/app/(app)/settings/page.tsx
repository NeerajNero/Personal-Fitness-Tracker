import type { Metadata } from "next";
import { signOut } from "@/auth";
import { todayIST } from "@/lib/dates";
import { EXPORT_TABLES } from "@/lib/export-tables";
import { listAllFoods } from "@/lib/food";
import { getPhase } from "@/lib/metrics/phase";
import { NUDGE_TOGGLES } from "@/lib/nudges";
import { requireUser } from "@/lib/session";
import { getSettings, hasBudgets, hasPhases } from "@/lib/settings";
import { listExercises, listRoutineExercises, listWorkoutTypes } from "@/lib/training";
import { getUser, listPeople } from "@/lib/users";
import { BodyStatsForm } from "./body-stats-form";
import { FoodsEditor } from "./foods-editor";
import { NudgeSettings } from "./nudge-settings";
import { People } from "./people";
import { PhaseSection } from "./phase-section";
import { WorkoutTypesEditor, type WorkoutTypeView } from "./workout-types-editor";
import { TargetsForm } from "./targets-form";
import { TelegramCard } from "./telegram-card";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const userId = await requireUser();
  const today = todayIST();
  const [s, user, allFoods, allExercises, days, re] = await Promise.all([
    getSettings(userId),
    getUser(userId),
    listAllFoods(userId),
    listExercises(userId),
    listWorkoutTypes(userId, { includeArchived: true }),
    listRoutineExercises(userId),
  ]);
  const people = user?.isAdmin ? await listPeople() : null;

  const types: WorkoutTypeView[] = days.map((d) => ({
    id: d.id,
    label: d.label,
    archived: d.archived,
    exercises: re.filter((x) => x.routineDayId === d.id).map(({ exerciseId, name, muscleGroup, cues, targetSets, targetReps }) => ({ exerciseId, name, muscleGroup, cues, targetSets, targetReps })),
  }));
  const toggles = Object.fromEntries(NUDGE_TOGGLES.map((k) => [k, s[k]])) as Record<(typeof NUDGE_TOGGLES)[number], boolean>;
  const bot = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? null;
  const phased = hasPhases(s);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <TargetsForm s={s} phased={phased} budgets={hasBudgets(s)} />
      {phased ? <PhaseSection s={s} phaseToday={getPhase(today, s)} /> : null}
      <TelegramCard linked={s.telegramChatId !== null} code={s.telegramLinkCode} bot={bot} />
      <NudgeSettings toggles={toggles} quietStart={s.quietHoursStart.slice(0, 5)} quietEnd={s.quietHoursEnd.slice(0, 5)} dailyCap={s.nudgeDailyCap} />

      <h2 className="mt-3 text-sm font-medium text-muted">Setup — rarely changed</h2>
      <FoodsEditor foods={allFoods} />
      <WorkoutTypesEditor types={types} allExercises={allExercises} weeklyTarget={s.weeklySessionTarget} />
      <BodyStatsForm s={s} today={today} />

      <details id="export" className="group rounded-2xl border border-border bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between p-4 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block font-semibold">Export data</span>
            <span className="block text-xs text-muted">One CSV per table, your rows only. Settings is not exported.</span>
          </span>
          <span className="text-muted transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <ul className="grid grid-cols-2 gap-2 px-4 pb-4">
          {EXPORT_TABLES.map((t) => (
            <li key={t}>
              <a href={`/api/export/${t}`} download className="flex h-11 items-center justify-between rounded-xl border border-border bg-bg px-3 text-sm font-medium active:opacity-70">
                {t.replace(/_/g, " ")}
                <span aria-hidden className="text-muted">↓</span>
              </a>
            </li>
          ))}
        </ul>
      </details>

      {people ? <People rows={people} /> : null}

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
