/** Rule definitions — windows exactly per CLAUDE.md, all times IST. */
import type { Food, Settings } from "@/db/schema";
import { addDays, todayIST } from "@/lib/dates";
import { esc, n0, n1 } from "@/lib/format";
import { foodInPhase } from "@/lib/food";
import { musclesInOrder } from "@/lib/metrics/strength";
import { mondayOf, VERDICT_LABEL } from "@/lib/metrics/trends";
import { appUrl } from "@/lib/telegram/env";
import { didButtons, planButtons, todaySummary } from "@/lib/telegram/messages";
import type { Rule, RuleCtx, RuleMessage } from "./engine";
import type { WeeklyReport } from "./weekly";

const fmtW = (w: number) => (w <= 0 ? "BW" : Number.isInteger(w) ? `${w}` : w.toFixed(1).replace(/\.0$/, ""));
const link = (path: string, label: string) => `<a href="${appUrl()}${path}">${label}</a>`;
const onboardingDate = (s: Settings, fallback: string) => (s.onboardedAt ? todayIST(s.onboardedAt) : (s.smokeFreeSince ?? fallback));

/** Greedy cheapest protein top-up: ≤ 2 foods, ≤ 2 servings each. */
export function cheapestFix(remainingG: number, ranked: Food[]): { text: string; grams: number } | null {
  const parts: string[] = [];
  let got = 0;
  for (const f of ranked) {
    if (got >= remainingG || parts.length === 2) break;
    if (f.proteinG <= 0) continue;
    const servings = Math.min(2, Math.max(1, Math.ceil((remainingG - got) / f.proteinG)));
    got += servings * f.proteinG;
    parts.push(`${servings > 1 ? `${servings} × ` : ""}${esc(f.name)} (${esc(f.servingLabel)})`);
  }
  return parts.length ? { text: parts.join(" + "), grams: Math.round(got) } : null;
}

/** Foods eaten this month ranked by ₹/g protein, then the rest of the in-phase catalogue by cost/protein. */
async function rankedProteinFoods(ctx: RuleCtx): Promise<Food[]> {
  const [foods, spend] = await Promise.all([ctx.load.foods(), ctx.load.spend()]);
  const inPhase = foods.filter((f) => foodInPhase(f, ctx.state.targets.phase) && f.proteinG > 0);
  const byId = new Map(inPhase.map((f) => [f.id, f]));
  const eaten = spend.foodsRanked.flatMap((r) => (r.foodId !== null && r.inrPerGProtein !== null && byId.has(r.foodId) ? [byId.get(r.foodId)!] : []));
  const eatenIds = new Set(eaten.map((f) => f.id));
  const rest = inPhase.filter((f) => !eatenIds.has(f.id)).sort((a, b) => a.costInr / a.proteinG - b.costInr / b.proteinG);
  return [...eaten, ...rest];
}

export function formatWeeklyReport(r: WeeklyReport): string {
  const lines = [`📊 <b>Week ${r.weekStart.slice(5)} → ${r.weekEnd.slice(5)}</b>`];
  lines.push(r.rate ? `⚖️ 7-day avg ${n1(r.rate.latest.avg7)} kg · ${r.rate.kgPerWeek > 0 ? "+" : ""}${r.rate.kgPerWeek.toFixed(2)} kg/wk (${r.rate.pctPerWeek > 0 ? "+" : ""}${r.rate.pctPerWeek.toFixed(2)} %)` : "⚖️ not enough weigh-ins for a trend");
  lines.push(r.navel ? `📏 Navel ${n1(r.navel.latest)} cm${r.navel.delta !== null ? ` (${r.navel.delta > 0 ? "+" : ""}${r.navel.delta} vs last)` : ""}` : "📏 no measurement this week");
  lines.push(`🏋️ ${r.sessionsDone}/${r.sessionTarget} sessions · lifts progressed ${r.lifts.progressed}/${r.lifts.tracked}`);
  const muscles = musclesInOrder(r.setsByMuscle);
  if (muscles.length) lines.push(`💪 Sets: ${muscles.map(([m, n]) => `${esc(m)} ${n}`).join(" · ")}`);
  const a = r.adherence;
  lines.push(`🍽 kcal in range ${a.kcalAdherencePct ?? "—"}% · protein hit ${a.proteinHitPct ?? "—"}% · ${a.daysLogged}/7 days logged`);
  lines.push(`🧭 <b>${VERDICT_LABEL[r.verdict.verdict]}</b>`);
  for (const reason of r.verdict.reasons) lines.push(`• ${esc(reason)}`);
  return lines.join("\n");
}

const weekly = (s: Settings) => s.nudgeWeeklyMeasure;
const milestones = (s: Settings) => s.nudgeMilestones;

export const RULES: Rule[] = [
  {
    key: "morning_brief",
    window: { start: "07:30", end: "08:30" },
    enabled: (s) => s.nudgeMorningBrief,
    condition: () => true,
    message: async ({ state, settings, load }) => {
      const lines: string[] = [];
      const { dayPlan: plan, nextUp } = state;
      let inlineKeyboard: RuleMessage["inlineKeyboard"];
      const topSets = async (typeId: number) => {
        const tops = await load.typeTopSets(typeId);
        if (tops.length) lines.push(tops.map((t) => `${esc(t.name)} ${fmtW(t.weightKg)}×${t.reps}`).join(" · "));
        else {
          lines.push((await load.typeExerciseNames(typeId)).map(esc).join(" · "));
          lines.push("First time — pick weights you can do for 8.");
        }
      };
      if (plan.kind === "workout" && plan.typeId !== null) {
        lines.push(`🏋️ <b>${esc(plan.typeName ?? "Workout")} today</b>`);
        await topSets(plan.typeId);
      } else if (plan.kind === "custom") {
        lines.push("🏋️ <b>Custom workout today</b>");
      } else if (plan.kind === "rest") {
        lines.push(`🛌 <b>Rest day</b> — ${n0(state.targets.stepsRange[0])}–${n0(state.targets.stepsRange[1])} steps`);
      } else if (nextUp) {
        const days = state.daysSince.find((d) => d.typeId === nextUp.typeId)?.days ?? null;
        const ago = days === null ? "first time" : days === 0 ? "last done today" : `last done ${days} ${days === 1 ? "day" : "days"} ago`;
        lines.push(`🏋️ Next up: <b>${esc(nextUp.typeName)}</b> (${ago})`);
        await topSets(nextUp.typeId);
        lines.push("What's today? Tap below, or send a type name / <code>rest</code>.");
        inlineKeyboard = planButtons(state);
      } else {
        lines.push(`👟 ${n0(state.targets.stepsRange[0])}–${n0(state.targets.stepsRange[1])} steps today`);
      }
      if (!state.flags.weightLogged) lines.push("⚖️ Weigh in: <code>w 74.2</code>");
      const d = state.smokeFreeDays;
      if (settings.nudgeMilestones && d !== null && d > 0 && d % 7 === 0) lines.push(`🚭 <b>${d} days smoke-free</b> — ${d / 7} ${d === 7 ? "week" : "weeks"}. Keep going.`);
      return { text: lines.join("\n"), inlineKeyboard };
    },
  },
  {
    key: "lunch_check",
    window: { start: "13:30", end: "14:30" },
    enabled: (s) => s.nudgeLunchCheck,
    condition: ({ state }) => !state.flags.foodLoggedSince("11:00"),
    message: () => ({ text: "🍽 Nothing logged since 11:00. Lunch? <code>paneer 150</code>, <code>roti 3</code> — or just tell me what you ate." }),
  },
  {
    key: "protein_check",
    window: { start: "16:30", end: "17:30" },
    enabled: (s) => s.nudgeProteinCheck,
    condition: ({ state }) => state.totals.protein < 0.45 * state.targets.proteinMin,
    message: async (ctx) => {
      const { totals, targets } = ctx.state;
      const remaining = Math.max(0, targets.proteinMin - totals.protein);
      const fix = cheapestFix(remaining, await rankedProteinFoods(ctx));
      const lines = [`🥚 Protein ${n0(totals.protein)} / ${targets.proteinMin} g — <b>${n0(remaining)} g to go</b>.`];
      if (fix) lines.push(`Cheapest fix: ${fix.text} = ${fix.grams} g`);
      return { text: lines.join("\n") };
    },
  },
  {
    key: "kcal_check",
    window: { start: "20:00", end: "20:45" },
    enabled: (s) => s.nudgeKcalCheck,
    condition: () => true,
    message: ({ state }) => {
      const { remaining, totals, targets } = state;
      return {
        text:
          remaining.kcal >= 0
            ? `🍽 <b>${n0(remaining.kcal)} kcal</b> left for dinner (${n0(totals.kcal)} / ${n0(targets.kcal)} so far).`
            : `⚠️ Already <b>${n0(-remaining.kcal)} kcal over</b> target — keep dinner light or call it a day.`,
      };
    },
  },
  {
    key: "day_close",
    window: { start: "22:00", end: "22:30" },
    enabled: (s) => s.nudgeDayClose,
    condition: () => true,
    message: ({ state }): RuleMessage => {
      const f = state.flags;
      const missing: string[] = [];
      if (!f.weightLogged) missing.push("weight — reply <code>w 74.2</code>");
      if (!f.stepsLogged) missing.push("steps — reply <code>s 8500</code>");
      const plan = state.dayPlan;
      const unset = plan.kind === "unset" && state.daysSince.length > 0;
      const workoutMissing = plan.kind === "workout" && !f.workoutLogged;
      if (workoutMissing) missing.push(`${esc(plan.typeName ?? "workout")} — tap below`);
      const parts = [todaySummary(state), missing.length ? `<b>Missing:</b>\n• ${missing.join("\n• ")}` : "All logged ✓"];
      if (unset) parts.push("<b>What did you do today?</b> Tap a workout to log it as same as last time.");
      return {
        text: parts.join("\n\n"),
        inlineKeyboard: unset || workoutMissing ? didButtons(state) : undefined,
      };
    },
  },
  {
    key: "water",
    window: { start: "10:00", end: "20:30" },
    enabled: (s) => s.nudgeWater,
    // Slots at 10:00, 12:00 … 20:00; fires within the first 30 min of each slot.
    condition: ({ now }) => (now.minutes - 600) % 120 < 30,
    logKey: ({ now }) => `water_${String(10 + 2 * Math.floor((now.minutes - 600) / 120)).padStart(2, "0")}`,
    message: ({ state }) => ({ text: `💧 Water — ${state.metrics.waterGlasses ?? 0} so far. Reply <code>water</code> when you've had a glass.` }),
  },
  {
    key: "weekly_measure",
    window: { start: "19:00", end: "22:30" },
    days: [7],
    enabled: weekly,
    condition: async ({ load }) => (await load.measurementsInWeek()).every((m) => m.navelCm === null && m.waistCm === null),
    message: () => ({
      text: `📏 <b>Sunday measure.</b> Navel at the belly button, relaxed, after waking is best. Reply <code>navel 88.5</code> and <code>waist 85</code>, or log in ${link("/trends", "Trends")}.`,
    }),
  },
  {
    key: "weekly_report",
    window: { start: "19:00", end: "22:30" },
    days: [7],
    once: "custom",
    enabled: weekly,
    logKey: ({ now }) => `weekly_report_${mondayOf(now.date)}`,
    condition: async ({ load }) => (await load.measurementsInWeek()).some((m) => m.navelCm !== null || m.waistCm !== null),
    message: async ({ now, load }) => ({ text: formatWeeklyReport(await load.weeklyReport(mondayOf(now.date))) }),
  },
  {
    key: "weekly_report_mon",
    window: { start: "08:00", end: "09:00" },
    days: [1],
    once: "custom",
    enabled: weekly,
    logKey: ({ now }) => `weekly_report_${mondayOf(addDays(now.date, -1))}`,
    condition: () => true,
    message: async ({ now, load }) => ({ text: formatWeeklyReport(await load.weeklyReport(mondayOf(addDays(now.date, -1)))) }),
  },
  {
    key: "budget_80",
    window: { start: "09:00", end: "21:00" },
    once: "month",
    enabled: (s) => s.nudgeBudget,
    condition: async ({ now, load }) => now.dayOfMonth < 24 && (await load.spend()).pctOfBudget >= 80,
    message: async ({ load }) => {
      const sp = await load.spend();
      const cheap = sp.foodsRanked.filter((f) => f.inrPerGProtein !== null).slice(0, 2).map((f) => `${esc(f.label)} ₹${f.inrPerGProtein}/g`);
      return {
        text: `💸 Protein spend <b>₹${n0(sp.spent)}</b> = ${sp.pctOfBudget}% of ₹${n0(sp.budget)} by day ${sp.dayOfMonth}. Projected ₹${n0(sp.projectedMonthEnd)} by month end.${cheap.length ? `\nCheapest this month: ${cheap.join(", ")}.` : ""}`,
      };
    },
  },
  {
    key: "phase_switch",
    window: { start: "08:00", end: "21:00" },
    once: "ever",
    enabled: milestones,
    condition: ({ now, settings }) => now.date === settings.phaseSwitchDate && settings.phaseOverride === null,
    message: ({ settings }) => ({
      text: `🔁 <b>Phase switch:</b> non-veg from today. Protein target ${settings.proteinMinNonveg}–${settings.proteinMaxNonveg} g/day, budget ₹${n0(settings.budgetNonvegInr)}/month. Eggs, chicken and fish are now in the food list.`,
    }),
  },
  {
    key: "checkpoint_card",
    window: { start: "08:00", end: "21:00" },
    once: "ever",
    enabled: milestones,
    condition: ({ now, settings }) => now.date === settings.checkpointDate,
    message: async ({ now, settings, load }) => {
      const c = await load.checkpoint(onboardingDate(settings, now.date), now.date);
      const sgn = (n: number, u: string) => `${n > 0 ? "+" : ""}${n} ${u}`;
      const lines = [
        `🗓 <b>8-week checkpoint</b> — gym renewal decision. ${c.from.slice(5)} → ${c.to.slice(5)}, ${c.days} ${c.days === 1 ? "day" : "days"}.`,
        `📏 Navel ${c.navel ? `${sgn(c.navel.delta, "cm")} (${c.navel.first} → ${c.navel.latest})` : "—"}`,
        `⚖️ Weight (7d avg) ${c.weight ? `${sgn(c.weight.delta, "kg")} (${c.weight.first} → ${c.weight.latest})` : "—"}`,
        `🏋️ Lifts progressed ${c.lifts.tracked ? `${c.lifts.progressed}/${c.lifts.tracked}` : "—"} · sessions ${c.sessionsDone}/${c.sessionsPlanned}`,
        `🍽 kcal in range ${c.kcalAdherencePct ?? "—"}% · protein hit ${c.proteinHitPct ?? "—"}% · ${c.daysLogged} days logged`,
        `Numbers only — the call is yours. ${link("/trends", "Full card in Trends")}.`,
      ];
      return { text: lines.join("\n") };
    },
  },
];
