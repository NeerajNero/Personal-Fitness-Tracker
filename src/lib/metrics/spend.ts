/** Protein-spend metrics. Read by the Trends spend section and the budget_80 nudge rule. */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { Settings } from "@/db/schema";
import { getTargets } from "@/lib/metrics/phase";
import { getSettings } from "@/lib/settings";

export type FoodSpend = {
  foodId: number | null;
  label: string;
  entries: number;
  costInr: number;
  proteinG: number;
  /** null when the food has no protein. */
  inrPerGProtein: number | null;
};

export type MonthSpend = {
  month: string; // "YYYY-MM"
  from: string;
  to: string; // the `date` passed in
  dayOfMonth: number;
  daysInMonth: number;
  spent: number;
  budget: number;
  pctOfBudget: number;
  projectedMonthEnd: number;
  /** Foods actually eaten this month, cheapest ₹ per g protein first. */
  foodsRanked: FoodSpend[];
};

export function daysInMonth(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export async function monthSpend(date: string, opts: { settings?: Settings } = {}): Promise<MonthSpend> {
  const settings = opts.settings ?? (await getSettings());
  const from = `${date.slice(0, 7)}-01`;
  const dayOfMonth = Number(date.slice(8, 10));
  const dim = daysInMonth(date);

  const res = await db.execute<{ food_id: number | null; label: string; entries: number; cost_inr: number; protein_g: number }>(sql`
    select food_id, max(label) as label, count(*)::int as entries, sum(cost_inr)::float as cost_inr, sum(protein_g)::float as protein_g
    from food_log where date between ${from} and ${date}
    group by food_id, case when food_id is null then label else '' end`);

  const foodsRanked: FoodSpend[] = res.rows
    .map((r) => ({
      foodId: r.food_id,
      label: r.label,
      entries: r.entries,
      costInr: Math.round(r.cost_inr * 100) / 100,
      proteinG: Math.round(r.protein_g * 10) / 10,
      inrPerGProtein: r.protein_g > 0 ? Math.round((r.cost_inr / r.protein_g) * 100) / 100 : null,
    }))
    .sort((a, b) => (a.inrPerGProtein ?? Infinity) - (b.inrPerGProtein ?? Infinity) || b.costInr - a.costInr);

  const spent = Math.round(foodsRanked.reduce((s, f) => s + f.costInr, 0));
  const budget = getTargets(date, settings).budget;
  return {
    month: date.slice(0, 7),
    from,
    to: date,
    dayOfMonth,
    daysInMonth: dim,
    spent,
    budget,
    pctOfBudget: budget > 0 ? Math.round((spent / budget) * 100) : 0,
    projectedMonthEnd: Math.round((spent / dayOfMonth) * dim),
    foodsRanked,
  };
}
