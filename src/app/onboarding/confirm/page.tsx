import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { todayIST } from "@/lib/dates";
import { getTargets } from "@/lib/metrics/phase";
import { requireUser } from "@/lib/session";
import { findSettings, hasNavelGoal, hasPhases } from "@/lib/settings";
import { GOALS } from "@/lib/targets";
import { label, primary } from "@/components/ui";

export const metadata: Metadata = { title: "Your targets" };

export default async function ConfirmPage() {
  const userId = await requireUser();
  const s = await findSettings(userId);
  if (!s) redirect("/onboarding");

  const t = getTargets(todayIST(), s);
  const phaseNote = !hasPhases(s) ? null : s.phaseOverride ? "set manually in settings" : t.phase === "veg" ? `until ${s.phaseSwitchDate}` : `from ${s.phaseSwitchDate}`;
  const bot = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <h1 className="text-3xl font-bold tracking-tight">Your targets</h1>
      <p className="mt-1 mb-6 text-muted">{GOALS[s.goal].label}. You can change any of these in Settings.</p>

      <dl className="divide-y divide-border rounded-2xl border border-border bg-surface">
        <Row label="Calories" value={`${s.kcalTarget} kcal`} sub={`${s.kcalMin}–${s.kcalMax} range`} />
        <Row label="Protein" value={`${t.proteinMin}–${t.proteinMax} g`} sub={phaseNote ? `${t.phase} phase, ${phaseNote}` : "a day"} />
        <Row label="Steps (rest days)" value={`${s.stepsMin.toLocaleString("en-IN")}–${s.stepsMax.toLocaleString("en-IN")}`} />
        <Row label="Training" value={`${s.weeklySessionTarget} a week`} sub={s.trainingLocation === "gym" ? "Push, Pull and Legs to start" : "at home; workout types live in Settings"} />
        {hasNavelGoal(s) ? <Row label="Navel goal" value={`${s.navelGoalMinCm}–${s.navelGoalMaxCm} cm`} sub={`from ${s.navelStartCm} cm by ${s.goalDate}`} /> : null}
      </dl>

      <section className="mt-6 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Link Telegram</h2>
        <p className="mt-1 text-sm text-muted">
          Most days you&apos;ll log from the bot. Send this to {bot ? <span className="font-medium text-fg">@{bot}</span> : "the bot"}:
        </p>
        <p className="mt-3 select-all rounded-xl bg-bg px-4 py-3 text-center text-xl font-bold tracking-widest">
          /start {s.telegramLinkCode}
        </p>
        {!bot ? <p className="mt-2 text-xs text-muted">The bot&apos;s name appears once TELEGRAM_BOT_USERNAME is set.</p> : null}
      </section>

      <Link href="/today" className={`${primary} mt-8 h-14 text-lg`}>
        Go to Today
      </Link>
    </main>
  );
}

function Row({ label: labelText, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className={label}>{labelText}</dt>
      <dd className="text-right">
        <div className="text-xl font-bold">{value}</div>
        {sub ? <div className="text-xs text-muted">{sub}</div> : null}
      </dd>
    </div>
  );
}
