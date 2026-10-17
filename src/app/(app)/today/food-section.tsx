"use client";

import { useMemo, useOptimistic, useState, useTransition, type FormEvent } from "react";
import type { Food, FoodLog } from "@/lib/food";
import { MEAL_SERVING } from "@/lib/format";
import { foodInPhase } from "@/lib/metrics/phase";
import type { Phase } from "@/lib/metrics/phase";
import { addFoodLog, copyPreviousDay, deleteFoodLog, quickAddFoodLog, updateFoodLogQty } from "./actions";

type Entry = Pick<FoodLog, "id" | "time" | "foodId" | "label" | "qty" | "kcal" | "proteinG" | "costInr">;

type OptAction =
  | { type: "add"; entry: Entry }
  | { type: "qty"; id: number; qty: number }
  | { type: "delete"; id: number };

function reducer(list: Entry[], a: OptAction): Entry[] {
  switch (a.type) {
    case "add":
      return [...list, a.entry];
    case "qty":
      return list.map((e) => {
        if (e.id !== a.id) return e;
        const k = a.qty / e.qty;
        return { ...e, qty: a.qty, kcal: e.kcal * k, proteinG: e.proteinG * k, costInr: e.costInr * k };
      });
    case "delete":
      return list.filter((e) => e.id !== a.id);
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmtQty = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/\.?0+$/, ""));
const btn = "flex items-center justify-center rounded-xl border border-border bg-surface active:opacity-70";
const field = "h-12 min-w-0 rounded-xl border border-border bg-bg px-3 outline-none focus:border-accent";

let tempId = -1;

export function FoodSection({ date, entries, foods, phase }: { date: string; entries: FoodLog[]; foods: Food[]; phase: Phase }) {
  const [list, dispatch] = useOptimistic<Entry[], OptAction>(entries, reducer);
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const inPhase = useMemo(() => foods.filter((f) => foodInPhase(f, phase)), [foods, phase]);
  const myMeals = inPhase.filter((f) => f.isFavourite);
  const q = query.trim().toLowerCase();
  const matches = q ? inPhase.filter((f) => f.name.toLowerCase().includes(q)) : inPhase;
  const servingsToday = (foodId: number) => list.filter((e) => e.foodId === foodId).reduce((s, e) => s + e.qty, 0);

  function add(food: Food) {
    setError(null);
    startTransition(async () => {
      dispatch({
        type: "add",
        entry: { id: tempId--, time: "", foodId: food.id, label: food.name, qty: 1, kcal: food.kcal, proteinG: food.proteinG, costInr: food.costInr },
      });
      const r = await addFoodLog(date, food.id, 1);
      if (!r.ok) setError(r.error);
    });
  }

  function setQty(e: Entry, qty: number) {
    if (qty < 0.25 || qty === e.qty) return;
    setError(null);
    startTransition(async () => {
      dispatch({ type: "qty", id: e.id, qty });
      const r = await updateFoodLogQty(e.id, qty);
      if (!r.ok) setError(r.error);
    });
  }

  function remove(id: number) {
    setEditingId(null);
    setError(null);
    startTransition(async () => {
      dispatch({ type: "delete", id });
      const r = await deleteFoodLog(id);
      if (!r.ok) setError(r.error);
    });
  }

  function copyYesterday() {
    setError(null);
    startTransition(async () => {
      const r = await copyPreviousDay(date);
      if (!r.ok) setError(r.error);
    });
  }

  function manualAdd(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const fd = new FormData(form);
    const input = {
      label: String(fd.get("label") ?? ""),
      kcal: String(fd.get("kcal") ?? ""),
      proteinG: String(fd.get("proteinG") ?? ""),
      saveAsMeal: fd.get("saveAsMeal") === "on",
    };
    setError(null);
    startTransition(async () => {
      dispatch({
        type: "add",
        entry: { id: tempId--, time: "", foodId: null, label: input.label, qty: 1, kcal: Number(input.kcal) || 0, proteinG: Number(input.proteinG) || 0, costInr: 0 },
      });
      const r = await quickAddFoodLog(date, input);
      if (r.ok) form.reset();
      else setError(r.error);
    });
  }

  return (
    <section className="flex flex-col gap-5">
      {/* My meals — one tap logs one serving */}
      <div>
        <h2 className="mb-2 text-sm font-medium text-muted">My meals</h2>
        <ul className="flex flex-wrap gap-2">
          {list.length === 0 ? (
            <li>
              <button type="button" disabled={pending} onClick={copyYesterday} className={`${btn} h-12 border-accent px-4 text-sm font-medium text-accent disabled:opacity-50`}>
                ↺ Same as yesterday
              </button>
            </li>
          ) : null}
          {myMeals.map((f) => {
            const n = servingsToday(f.id);
            return (
              <li key={f.id}>
                <button type="button" onClick={() => add(f)} className={`${btn} h-12 flex-col px-4 leading-tight`}>
                  <span className="text-sm font-medium">
                    {f.name}
                    {n > 0 ? <span className="ml-1.5 rounded-full bg-accent/15 px-1.5 text-xs text-accent">×{fmtQty(n)}</span> : null}
                  </span>
                  <span className="text-[11px] text-muted tabular-nums">
                    {Math.round(f.kcal)} kcal · {round1(f.proteinG)} g
                  </span>
                </button>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setShowAll((v) => !v)} className={`${btn} h-12 px-4 text-sm text-muted ${showAll ? "border-accent text-accent" : ""}`}>
              {showAll ? "Hide foods" : "All foods…"}
            </button>
          </li>
        </ul>

        {showAll ? (
          <div className="mt-2 rounded-2xl border border-border bg-surface p-2">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search foods" className={`${field} w-full`} />
            <ul className="mt-2 max-h-72 divide-y divide-border overflow-y-auto">
              {matches.length === 0 ? <li className="p-3 text-sm text-muted">No match.</li> : null}
              {matches.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => add(f)} className="flex h-14 w-full items-center justify-between px-2 text-left active:bg-bg">
                    <span>
                      <span className="font-medium">{f.name}</span>
                      <span className="ml-2 text-xs text-muted">{f.servingLabel}</span>
                    </span>
                    <span className="text-xs text-muted tabular-nums">
                      {Math.round(f.kcal)} kcal · {round1(f.proteinG)} g
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Manual entry — paste the numbers from your photo estimate */}
      <form onSubmit={manualAdd} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3">
        <h2 className="text-sm font-medium text-muted">Add a meal</h2>
        <input name="label" required maxLength={80} placeholder="What did you eat?" className={field} />
        <div className="flex gap-2">
          <input name="kcal" type="number" inputMode="decimal" min={0} required placeholder="kcal" className={`${field} w-0 flex-1`} />
          <input name="proteinG" type="number" inputMode="decimal" min={0} step="0.1" placeholder="protein g" className={`${field} w-0 flex-1`} />
          <button type="submit" className="h-12 rounded-xl bg-accent px-5 font-medium text-accent-fg active:opacity-80">
            Add
          </button>
        </div>
        <label className="flex h-10 items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="saveAsMeal" className="size-5 accent-[var(--accent)]" />
          Save to My meals (one tap next time)
        </label>
      </form>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {/* Logged today */}
      <div>
        <h2 className="mb-2 text-sm font-medium text-muted">Logged</h2>
        {list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {list.map((e) => (
              <MealRow
                key={e.id}
                entry={e}
                servingLabel={e.foodId !== null ? (foodById.get(e.foodId)?.servingLabel ?? null) : null}
                editing={editingId === e.id}
                onTap={() => setEditingId(editingId === e.id ? null : e.id)}
                onQty={(qty) => setQty(e, qty)}
                onDelete={() => remove(e.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function MealRow({
  entry: e,
  servingLabel,
  editing,
  onTap,
  onQty,
  onDelete,
}: {
  entry: Entry;
  servingLabel: string | null;
  editing: boolean;
  onTap: () => void;
  onQty: (qty: number) => void;
  onDelete: () => void;
}) {
  const pending = e.id < 0;
  return (
    <li className={pending ? "opacity-60" : ""}>
      <button type="button" disabled={pending} onClick={onTap} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{e.label}</span>
          {e.qty !== 1 || (servingLabel && servingLabel !== MEAL_SERVING) ? (
            <span className="block text-xs text-muted">
              {fmtQty(e.qty)} × {servingLabel ?? "serving"}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-right text-sm tabular-nums">
          <span className="block">{Math.round(e.kcal)} kcal</span>
          <span className="block text-xs text-muted">{round1(e.proteinG)} g</span>
        </span>
      </button>

      {editing ? (
        <div className="flex items-center gap-2 px-4 pb-3">
          <button type="button" onClick={onDelete} className="h-11 rounded-xl px-3 text-sm font-medium text-danger active:opacity-70">
            Delete
          </button>
          <span className="flex-1" />
          <button type="button" onClick={() => onQty(round1(e.qty - 0.5))} className={`${btn} size-11 text-xl`} aria-label="Less">
            −
          </button>
          <input
            type="number"
            inputMode="decimal"
            step="0.25"
            min={0.25}
            defaultValue={e.qty}
            key={e.qty}
            onBlur={(ev) => {
              const v = Number(ev.target.value);
              if (Number.isFinite(v)) onQty(v);
            }}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
            }}
            className="h-11 w-16 rounded-xl border border-border bg-bg text-center text-lg tabular-nums outline-none focus:border-accent"
            aria-label="Servings"
          />
          <button type="button" onClick={() => onQty(round1(e.qty + 0.5))} className={`${btn} size-11 text-xl`} aria-label="More">
            +
          </button>
        </div>
      ) : null}
    </li>
  );
}
