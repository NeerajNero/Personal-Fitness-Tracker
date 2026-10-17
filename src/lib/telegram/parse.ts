/** Exact-match command parsing. Pure; no DB. Anything that isn't a command falls through to AI. */
import { z } from "zod";
import type { Food } from "@/db/schema";

export type Command =
  | { type: "weight"; kg: number }
  | { type: "steps"; n: number }
  | { type: "water" }
  | { type: "done" }
  | { type: "today" }
  | { type: "undo" }
  | { type: "help" }
  | { type: "navel"; cm: number }
  | { type: "waist"; cm: number }
  | { type: "copy" }
  | { type: "manual"; label: string; kcal: number; proteinG: number }
  | { type: "food"; query: string; n: number | null };

const kg = z.coerce.number().min(30).max(300);
const steps = z.coerce.number().int().min(0).max(100_000);
const cm = z.coerce.number().min(40).max(200);
const kcal = z.coerce.number().min(0).max(5000);
const protein = z.coerce.number().min(0).max(500);
const KEYWORDS: Record<string, Command["type"]> = { water: "water", done: "done", today: "today", undo: "undo", help: "help", start: "help", copy: "copy", same: "copy" };

export function parseCommand(raw: string): Command | null {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return null;
  const lower = text.toLowerCase();

  const kw = lower.replace(/^\//, "").replace(/@\w+$/, "");
  if (kw in KEYWORDS && !kw.includes(" ")) return { type: KEYWORDS[kw] } as Command;

  const w = /^w\s+(\d+(?:\.\d+)?)$/i.exec(text);
  if (w) {
    const v = kg.safeParse(w[1]);
    return v.success ? { type: "weight", kg: Math.round(v.data * 10) / 10 } : null;
  }
  const s = /^s\s+(\d+)$/i.exec(text);
  if (s) {
    const v = steps.safeParse(s[1]);
    return v.success ? { type: "steps", n: v.data } : null;
  }
  const mm = /^(navel|waist)\s+(\d+(?:\.\d+)?)$/i.exec(text);
  if (mm) {
    const v = cm.safeParse(mm[2]);
    return v.success ? { type: mm[1].toLowerCase() as "navel" | "waist", cm: Math.round(v.data * 10) / 10 } : null;
  }

  // `<meal name> <kcal> <protein>` — manual entry from an outside estimate.
  const m = /^([a-z][a-z .()'/-]*?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/i.exec(text);
  if (m) {
    const k = kcal.safeParse(m[2]);
    const p = protein.safeParse(m[3]);
    return k.success && p.success ? { type: "manual", label: m[1].trim(), kcal: Math.round(k.data * 10) / 10, proteinG: Math.round(p.data * 10) / 10 } : null;
  }

  // `<food words> [n]` — letters first, optional trailing number.
  const f = /^([a-z][a-z .()'/-]*?)(?:\s+(\d+(?:\.\d+)?))?$/i.exec(text);
  if (f) {
    const n = f[2] === undefined ? null : Number(f[2]);
    if (n !== null && !(n > 0 && n <= 5000)) return null;
    return { type: "food", query: f[1].trim(), n };
  }
  return null;
}

export const ALIASES: Record<string, string> = {
  scoop: "whey",
  whey: "whey",
  dahi: "curd",
  milk: "toned milk",
  egg: "whole egg",
  eggs: "whole egg",
  chicken: "chicken breast",
};

/** exact → starts-with → contains, case-insensitive. `foods` should be favourites-first so ties prefer favourites. */
export function matchFood(query: string, foods: Food[]): Food | null {
  const q0 = query.trim().toLowerCase();
  const q = ALIASES[q0] ?? q0;
  const names = foods.map((f) => ({ f, n: f.name.toLowerCase() }));
  const find = (needle: string) =>
    names.find((x) => x.n === needle)?.f ?? names.find((x) => x.n.startsWith(needle))?.f ?? names.find((x) => x.n.includes(needle))?.f ?? null;
  // Plain plural fallback: "rotis" → "roti", "eggs" handled by the alias table.
  return find(q) ?? (q.endsWith("s") && q.length > 3 ? find(q.slice(0, -1)) : null);
}

/** No number → 1 serving; n < 10 → servings; n ≥ 10 → grams/ml via serving_grams. */
export function servingsFor(food: Pick<Food, "name" | "servingGrams" | "servingLabel">, n: number | null): { qty: number } | { error: string } {
  if (n === null) return { qty: 1 };
  if (n < 10) return { qty: n };
  if (!food.servingGrams) return { error: `${food.name} is counted per ${food.servingLabel} — send a number under 10.` };
  return { qty: Math.round((n / food.servingGrams) * 100) / 100 };
}

/**
 * Day-plan words: `rest`, or an active workout type's name/label (case-insensitive, whole message).
 * Checked before food matching, so a type called "Pull" wins over a food starting with "pull".
 */
export function matchPlanWord(raw: string, types: { id: number; name: string; label: string }[]): { kind: "rest" } | { kind: "workout"; typeId: number } | null {
  const t = raw.trim().replace(/\s+/g, " ").replace(/^\//, "").toLowerCase();
  if (t === "rest") return { kind: "rest" };
  const hit = types.find((x) => x.name.toLowerCase() === t || x.label.toLowerCase() === t);
  return hit ? { kind: "workout", typeId: hit.id } : null;
}
