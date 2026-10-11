"use client";

import { useMemo, useOptimistic, useRef, useState, useTransition, type FormEvent } from "react";
import type { Food, FoodLog } from "@/lib/food";
import { foodInPhase } from "@/lib/food";
import type { Phase } from "@/lib/metrics/phase";
import { addFoodLog, deleteFoodLog, quickAddFoodLog, updateFoodLogQty } from "./actions";

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

let tempId = -1;

export function FoodSection({ date, entries, foods, phase }: { date: string; entries: FoodLog[]; foods: Food[]; phase: Phase }) {
  const [list, dispatch] = useOptimistic<Entry[], OptAction>(entries, reducer);
  const [, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [armedId, setArmedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showQuick, setShowQuick] = useState(false);

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const inPhase = useMemo(() => foods.filter((f) => foodInPhase(f, phase)), [foods, phase]);
  const favourites = inPhase.filter((f) => f.isFavourite);
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
      if (r.ok) setEditingId(r.id);
      else setError(r.error);
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
    setArmedId(null);
    setEditingId(null);
    setError(null);
    startTransition(async () => {
      dispatch({ type: "delete", id });
      const r = await deleteFoodLog(id);
      if (!r.ok) setError(r.error);
    });
  }

  function quickAdd(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const fd = new FormData(form);
    const input = {
      label: String(fd.get("label") ?? ""),
      kcal: String(fd.get("kcal") ?? ""),
      proteinG: String(fd.get("proteinG") ?? ""),
      costInr: String(fd.get("costInr") ?? ""),
    };
    setError(null);
    startTransition(async () => {
      dispatch({
        type: "add",
        entry: { id: tempId--, time: "", foodId: null, label: input.label, qty: 1, kcal: Number(input.kcal) || 0, proteinG: Number(input.proteinG) || 0, costInr: Number(input.costInr) || 0 },
      });
      const r = await quickAddFoodLog(date, input);
      if (r.ok) {
        form.reset();
        setShowQuick(false);
      } else setError(r.error);
    });
  }

  return (
    <section className="flex flex-col gap-4">
      {/* Meals */}
      <div>
        <h2 className="mb-2 text-sm font-medium text-muted">Meals</h2>
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
                armed={armedId === e.id}
                onTap={() => {
                  setArmedId(null);
                  setEditingId(editingId === e.id ? null : e.id);
                }}
                onLongPress={() => {
                  setEditingId(null);
                  setArmedId(e.id);
                }}
                onQty={(qty) => setQty(e, qty)}
                onDelete={() => remove(e.id)}
                onCancel={() => setArmedId(null)}
              />
            ))}
          </ul>
        )}
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </div>

      {/* Favourites */}
      <div>
        <h2 className="mb-2 text-sm font-medium text-muted">Favourites</h2>
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {favourites.map((f) => {
            const n = servingsToday(f.id);
            return (
              <li key={f.id} className="shrink-0">
                <button type="button" onClick={() => add(f)} className={`${btn} h-12 flex-col px-4 leading-tight`}>
                  <span className="text-sm font-medium">
                    {f.name}
                    {n > 0 ? <span className="ml-1.5 rounded-full bg-accent/15 px-1.5 text-xs text-accent">×{fmtQty(n)}</span> : null}
                  </span>
                  <span className="text-[11px] text-muted">{f.servingLabel}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* All foods + search */}
      <div>
        <div className="flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowAll(true);
            }}
            onFocus={() => setShowAll(true)}
            placeholder="Search foods"
            className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 outline-none focus:border-accent"
          />
          <button type="button" onClick={() => setShowAll((v) => !v)} className={`${btn} h-12 px-4 text-sm font-medium`}>
            {showAll ? "Hide" : "All"}
          </button>
          <button
            type="button"
            onClick={() => setShowQuick((v) => !v)}
            className={`${btn} h-12 px-4 text-sm font-medium ${showQuick ? "border-accent text-accent" : ""}`}
          >
            + Quick
          </button>
        </div>

        {showAll ? (
          <ul className="mt-2 max-h-72 divide-y divide-border overflow-y-auto rounded-2xl border border-border bg-surface">
            {matches.length === 0 ? <li className="p-3 text-sm text-muted">No match.</li> : null}
            {matches.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => add(f)} className="flex h-14 w-full items-center justify-between px-4 text-left active:bg-bg">
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
        ) : null}

        {showQuick ? (
          <form onSubmit={quickAdd} className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-surface p-3">
            <input name="label" required maxLength={80} placeholder="What" className="col-span-2 h-12 rounded-xl border border-border bg-bg px-3 outline-none focus:border-accent" />
            <input name="kcal" type="number" inputMode="decimal" min={0} required placeholder="kcal" className="h-12 rounded-xl border border-border bg-bg px-3 outline-none focus:border-accent" />
            <input name="proteinG" type="number" inputMode="decimal" min={0} step="0.1" required placeholder="protein g" className="h-12 rounded-xl border border-border bg-bg px-3 outline-none focus:border-accent" />
            <input name="costInr" type="number" inputMode="decimal" min={0} step="0.5" placeholder="₹ (optional)" className="h-12 rounded-xl border border-border bg-bg px-3 outline-none focus:border-accent" />
            <button type="submit" className="h-12 rounded-xl bg-accent font-medium text-accent-fg active:opacity-80">
              Add
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}

function MealRow({
  entry: e,
  servingLabel,
  editing,
  armed,
  onTap,
  onLongPress,
  onQty,
  onDelete,
  onCancel,
}: {
  entry: Entry;
  servingLabel: string | null;
  editing: boolean;
  armed: boolean;
  onTap: () => void;
  onLongPress: () => void;
  onQty: (qty: number) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const pending = e.id < 0;

  const start = () => {
    fired.current = false;
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, 500);
  };
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <li className={pending ? "opacity-60" : ""}>
      <div
        role="button"
        tabIndex={0}
        onPointerDown={start}
        onPointerUp={clear}
        onPointerLeave={clear}
        onPointerCancel={clear}
        onContextMenu={(ev) => ev.preventDefault()}
        onClick={() => {
          if (fired.current) {
            fired.current = false;
            return;
          }
          if (!pending) onTap();
        }}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            onTap();
          }
          if (ev.key === "Delete" || ev.key === "Backspace") onLongPress();
        }}
        className="flex min-h-14 select-none items-center gap-3 px-4 py-2 [touch-action:manipulation]"
      >
        <span className="w-11 shrink-0 text-xs text-muted tabular-nums">{e.time ? e.time.slice(0, 5) : "…"}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{e.label}</span>
          <span className="block text-xs text-muted">
            {fmtQty(e.qty)} × {servingLabel ?? "serving"}
          </span>
        </span>
        <span className="shrink-0 text-right text-sm tabular-nums">
          <span className="block">{Math.round(e.kcal)} kcal</span>
          <span className="block text-xs text-muted">{round1(e.proteinG)} g</span>
        </span>
      </div>

      {editing && !armed ? (
        <div className="flex items-center justify-end gap-2 px-4 pb-3">
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
            className="h-11 w-20 rounded-xl border border-border bg-bg text-center text-lg tabular-nums outline-none focus:border-accent"
            aria-label="Servings"
          />
          <button type="button" onClick={() => onQty(round1(e.qty + 0.5))} className={`${btn} size-11 text-xl`} aria-label="More">
            +
          </button>
        </div>
      ) : null}

      {armed ? (
        <div className="flex items-center justify-end gap-2 px-4 pb-3">
          <button type="button" onClick={onCancel} className={`${btn} h-11 px-4 text-sm`}>
            Cancel
          </button>
          <button type="button" onClick={onDelete} className="h-11 rounded-xl bg-danger px-4 text-sm font-medium text-white active:opacity-80">
            Delete
          </button>
        </div>
      ) : null}
    </li>
  );
}
