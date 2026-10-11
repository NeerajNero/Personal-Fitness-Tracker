/**
 * Free-text meal parsing with Gemini (structured JSON output), plus the pending-parse store.
 * Degrades to null on any failure (network, 429, bad JSON) — the caller replies with a hint.
 */
import { GoogleGenAI, Type } from "@google/genai";
import { eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { pendingParses, type Food } from "@/db/schema";
import { foodInPhase } from "@/lib/food";
import type { Phase } from "@/lib/metrics/phase";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

export type ParsedItem = {
  label: string;
  foodId: number | null;
  qty: number;
  kcal: number;
  proteinG: number;
  costInr: number;
  confidence: number;
};

export type PendingPayload = { date: string; text: string; items: ParsedItem[]; totals: { kcal: number; proteinG: number } };

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING, description: "Short food name as the user would recognise it" },
          food_id: { type: Type.INTEGER, nullable: true, description: "id from the catalogue when it matches, else null" },
          servings: { type: Type.NUMBER, nullable: true, description: "number of catalogue servings when food_id is set" },
          kcal: { type: Type.NUMBER, description: "total kcal for this item" },
          protein_g: { type: Type.NUMBER, description: "total protein grams for this item" },
          confidence: { type: Type.NUMBER, description: "0–1" },
        },
        required: ["label", "food_id", "servings", "kcal", "protein_g", "confidence"],
      },
    },
  },
  required: ["items"],
};

const outSchema = z.object({
  items: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        food_id: z.number().int().nullable(),
        servings: z.number().positive().max(50).nullable(),
        kcal: z.number().min(0).max(5000),
        protein_g: z.number().min(0).max(500),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(20),
});

function systemInstruction(foods: Food[]): string {
  const catalogue = foods.map((f) => ({ id: f.id, name: f.name, serving: f.servingLabel, serving_grams: f.servingGrams, kcal: f.kcal, protein_g: f.proteinG }));
  return [
    "You turn a short message about food eaten (Indian home cooking, English/Hinglish) into itemised nutrition.",
    "Prefer the catalogue: when an item matches a catalogue food, set food_id and servings (convert grams/ml with serving_grams; 'scoop' means whey; 'dahi' is curd).",
    "Otherwise set food_id null and estimate kcal and protein_g for the described amount using typical Indian portion sizes.",
    "kcal and protein_g are totals for the item (servings × per-serving when food_id is set). One entry per distinct item. Ignore non-food text.",
    `Catalogue (per serving): ${JSON.stringify(catalogue)}`,
  ].join("\n");
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Returns null on failure or when nothing edible was found. */
export async function parseFreeText(text: string, foods: Food[], phase: Phase): Promise<ParsedItem[] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const inPhase = foods.filter((f) => foodInPhase(f, phase));
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const res = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: text,
      config: {
        systemInstruction: systemInstruction(inPhase),
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.1,
        abortSignal: AbortSignal.timeout(15_000),
      },
    });
    const parsed = outSchema.safeParse(JSON.parse(res.text ?? ""));
    if (!parsed.success) return null;
    const byId = new Map(foods.map((f) => [f.id, f]));
    const items: ParsedItem[] = parsed.data.items.map((it) => {
      const food = it.food_id !== null ? byId.get(it.food_id) : undefined;
      if (food && it.servings) {
        return { label: food.name, foodId: food.id, qty: Math.round(it.servings * 100) / 100, kcal: r1(food.kcal * it.servings), proteinG: r1(food.proteinG * it.servings), costInr: Math.round(food.costInr * it.servings * 100) / 100, confidence: it.confidence };
      }
      return { label: it.label, foodId: null, qty: 1, kcal: r1(it.kcal), proteinG: r1(it.protein_g), costInr: 0, confidence: it.confidence };
    });
    return items.length ? items : null;
  } catch {
    return null;
  }
}

/* ------------------------------ pending store ------------------------------ */

export async function createPending(payload: PendingPayload): Promise<number> {
  const [row] = await db.insert(pendingParses).values({ payload }).returning({ id: pendingParses.id });
  return row.id;
}

/** Fetch and delete in one go; null when missing or expired. */
export async function takePending(id: number): Promise<PendingPayload | null> {
  const [row] = await db.delete(pendingParses).where(eq(pendingParses.id, id)).returning({ payload: pendingParses.payload, createdAt: pendingParses.createdAt });
  if (!row) return null;
  if (Date.now() - row.createdAt.getTime() > 24 * 3600 * 1000) return null;
  return row.payload as PendingPayload;
}

export async function expirePending(): Promise<void> {
  await db.delete(pendingParses).where(lt(pendingParses.createdAt, sql`now() - interval '24 hours'`));
}
