import type { Metadata } from "next";
import { signOut } from "@/auth";
import { EXPORT_TABLES } from "@/lib/export-tables";
import { getSettings } from "@/lib/settings";
import { NUDGE_TOGGLES } from "@/lib/nudges";
import { NudgeSettings } from "./nudge-settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const s = await getSettings();
  const toggles = Object.fromEntries(NUDGE_TOGGLES.map((k) => [k, s[k]])) as Record<(typeof NUDGE_TOGGLES)[number], boolean>;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-muted">Targets, foods and routine editors arrive in a later step.</p>

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
