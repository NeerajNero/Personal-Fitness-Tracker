import type { Metadata } from "next";
import { ChevronDown, Download } from "lucide-react";
import { signOut } from "@/auth";
import { ICON } from "@/components/icons";
import { btn, label } from "@/components/ui";
import { todayIST } from "@/lib/dates";
import { EXPORT_TABLES } from "@/lib/export-tables";
import { listAllFoods } from "@/lib/food";
import { getPhase } from "@/lib/metrics/phase";
import { NUDGE_TOGGLES } from "@/lib/nudges";
import { requireUser } from "@/lib/session";
import { getSettings, hasBudgets, hasPhases } from "@/lib/settings";
import { ladderSizes, listExercises, listRoutineExercises, listWorkoutTypes } from "@/lib/training";
import { getUser, listPeople } from "@/lib/users";
import { BodyStatsForm } from "./body-stats-form";
import { Diagnostics } from "./diagnostics";
import { FoodsEditor } from "./foods-editor";
import { NudgeSettings } from "./nudge-settings";
import { People } from "./people";
import { PhaseSection } from "./phase-section";
import { WorkoutTypesEditor, type WorkoutTypeView } from "./workout-types-editor";
import { TargetsForm } from "./targets-form";
import { TelegramCard } from "./telegram-card";
import { run } from "@/lib/action-result";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const userId = await requireUser();
  const today = todayIST();
  const [s, user, allFoods, allExercises, days, re, ladders] = await Promise.all([
    getSettings(userId),
    getUser(userId),
    listAllFoods(userId),
    listExercises(userId),
    listWorkoutTypes(userId, { includeArchived: true }),
    listRoutineExercises(userId),
    ladderSizes(userId),
  ]);
  const people = user?.isAdmin ? await listPeople() : null;

  const types: WorkoutTypeView[] = days.map((d) => ({
    id: d.id,
    label: d.label,
    archived: d.archived,
    exercises: re
      .filter((x) => x.routineDayId === d.id)
      .map(({ exerciseId, name, muscleGroup, cues, targetSets, targetReps, measure, pattern, ladder, ladderLevel }) => ({
        exerciseId, name, muscleGroup, cues, targetSets, targetReps, measure, finisher: pattern === "conditioning",
        rung: ladder && ladderLevel !== null ? { ladder, level: ladderLevel, max: ladders.get(ladder) ?? ladderLevel } : null,
      })),
  }));
  const toggles = Object.fromEntries(NUDGE_TOGGLES.map((k) => [k, s[k]])) as Record<(typeof NUDGE_TOGGLES)[number], boolean>;
  const bot = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? null;
  const phased = hasPhases(s);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <TargetsForm s={s} phased={phased} budgets={hasBudgets(s)} />
      {phased ? <PhaseSection s={s} phaseToday={getPhase(today, s)} /> : null}
      <TelegramCard linked={s.telegramChatId !== null} code={s.telegramLinkCode} bot={bot} />
      <NudgeSettings toggles={toggles} quietStart={s.quietHoursStart.slice(0, 5)} quietEnd={s.quietHoursEnd.slice(0, 5)} dailyCap={s.nudgeDailyCap} />

      <h2 className={`mt-3 ${label}`}>Setup, rarely changed</h2>
      <FoodsEditor foods={allFoods} />
      <WorkoutTypesEditor types={types} allExercises={allExercises} weeklyTarget={s.weeklySessionTarget} home={s.trainingLocation === "home"} userEquipment={s.trainingLocation === "home" ? s.equipment : null} />
      <BodyStatsForm s={s} today={today} />

      <details id="export" className="group rounded-2xl border border-border bg-surface">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block font-semibold">Export data</span>
            <span className={`block ${label}`}>One CSV per table, your rows only. Settings is not exported.</span>
          </span>
          <ChevronDown {...ICON} className="shrink-0 text-muted group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-150" />
        </summary>
        <ul className="grid grid-cols-2 gap-2 px-4 pb-4">
          {EXPORT_TABLES.map((t) => (
            <li key={t}>
              <a href={`/api/export/${t}`} download className="flex h-11 items-center justify-between rounded-xl border border-border bg-bg px-3 text-sm font-medium active:opacity-70">
                {t.replace(/_/g, " ")}
                <Download {...ICON} className="text-muted" />
              </a>
            </li>
          ))}
        </ul>
      </details>

      {people ? <People rows={people} /> : null}

      <h2 className={`mt-3 ${label}`}>When something&apos;s off</h2>
      <Diagnostics />

      <form
        action={async () => {
          "use server";
          await run("signOut", async () => {
            await signOut({ redirectTo: "/login" });
          });
        }}
      >
        <button type="submit" className={`${btn} h-12 w-full text-base text-danger`}>
          Sign out
        </button>
      </form>
    </div>
  );
}
