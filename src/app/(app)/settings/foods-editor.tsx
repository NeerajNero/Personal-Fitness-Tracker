"use client";

import { useActionState, useState, useTransition } from "react";
import type { Food } from "@/db/schema";
import { saveFood, setFoodArchived, setFoodFavourite, type FormState } from "./actions";
import { btn, Card, Field, input, primary } from "./ui";

const GROUPS: { tag: Food["phaseTag"]; label: string }[] = [
  { tag: "veg", label: "Veg" },
  { tag: "both", label: "Both phases" },
  { tag: "nonveg", label: "Non-veg" },
];

export function FoodsEditor({ foods }: { foods: Food[] }) {
  const [adding, setAdding] = useState(false);
  const active = foods.filter((f) => !f.archived);
  const archived = foods.filter((f) => f.archived);

  return (
    <Card title="Foods & My meals" sub={`${active.length} active · tap a food to edit. Archive instead of delete — logs keep their history.`} collapsible defaultOpen={false}>
      {GROUPS.map((g) => {
        const list = active.filter((f) => f.phaseTag === g.tag);
        if (!list.length) return null;
        return (
          <div key={g.tag} className="mb-3">
            <h3 className="mb-1 text-xs font-medium text-muted">{g.label}</h3>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {list.map((f) => <FoodRow key={f.id} food={f} />)}
            </ul>
          </div>
        );
      })}

      {adding ? (
        <FoodForm food={null} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${btn} w-full`}>+ Add food</button>
      )}

      {archived.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted">Archived ({archived.length})</summary>
          <ul className="mt-1 divide-y divide-border rounded-xl border border-border">
            {archived.map((f) => <FoodRow key={f.id} food={f} />)}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

function FoodRow({ food }: { food: Food }) {
  const [open, setOpen] = useState(false);
  const [fav, setFav] = useState(food.isFavourite);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function toggleFav() {
    const v = !fav;
    setFav(v);
    start(async () => {
      const r = await setFoodFavourite(food.id, v);
      if (!r.ok) {
        setFav(!v);
        setError(r.error);
      }
    });
  }
  function archive(archived: boolean) {
    start(async () => {
      const r = await setFoodArchived(food.id, archived);
      if (!r.ok) setError(r.error);
      else setOpen(false);
    });
  }

  return (
    <li className={food.archived ? "opacity-60" : ""}>
      <div className="flex min-h-12 items-center gap-2 pl-3 pr-1">
        <button type="button" onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 py-2 text-left">
          <span className="block truncate font-medium">{food.name}</span>
          <span className="block text-xs text-muted">{food.servingLabel} · {Math.round(food.kcal)} kcal · {food.proteinG} g · ₹{food.costInr}</span>
        </button>
        {!food.archived ? (
          <button type="button" onClick={toggleFav} aria-label={fav ? "Unfavourite" : "Favourite"} aria-pressed={fav} className={`flex size-10 items-center justify-center text-lg ${fav ? "text-warn" : "text-border"}`}>★</button>
        ) : (
          <button type="button" onClick={() => archive(false)} className={`${btn} h-9 px-3 text-xs`}>Restore</button>
        )}
      </div>
      {open ? <FoodForm food={food} onDone={() => setOpen(false)} onArchive={food.archived ? undefined : () => archive(true)} /> : null}
      {error ? <p className="px-3 pb-2 text-xs text-danger">{error}</p> : null}
    </li>
  );
}

function FoodForm({ food, onDone, onArchive }: { food: Food | null; onDone: () => void; onArchive?: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const r = await saveFood(prev, fd);
    if (r?.ok) onDone();
    return r;
  }, null);
  const fe = state?.fieldErrors ?? {};
  const small = `${input} h-11 px-2 text-sm`;

  return (
    <form action={action} className="grid grid-cols-2 gap-2 border-t border-border bg-bg/50 p-3">
      <input type="hidden" name="id" value={food?.id ?? ""} />
      <Field label="Name" error={fe.name} className="col-span-2"><input name="name" defaultValue={food?.name ?? ""} required maxLength={60} className={small} /></Field>
      <Field label="Serving label" error={fe.servingLabel}><input name="servingLabel" defaultValue={food?.servingLabel ?? ""} required maxLength={40} placeholder="100 g" className={small} /></Field>
      <Field label="Serving grams (optional)" error={fe.servingGrams}><input name="servingGrams" type="number" inputMode="decimal" step="0.5" defaultValue={food?.servingGrams ?? ""} placeholder="for `paneer 150`" className={small} /></Field>
      <Field label="kcal / serving" error={fe.kcal}><input name="kcal" type="number" inputMode="decimal" step="1" defaultValue={food?.kcal ?? ""} required className={small} /></Field>
      <Field label="Protein g / serving" error={fe.proteinG}><input name="proteinG" type="number" inputMode="decimal" step="0.1" defaultValue={food?.proteinG ?? ""} required className={small} /></Field>
      <Field label="₹ / serving" error={fe.costInr}><input name="costInr" type="number" inputMode="decimal" step="0.5" defaultValue={food?.costInr ?? ""} className={small} /></Field>
      <Field label="Phase" error={fe.phaseTag}>
        <select name="phaseTag" defaultValue={food?.phaseTag ?? "veg"} className={small}>
          <option value="veg">veg</option>
          <option value="both">both</option>
          <option value="nonveg">non-veg</option>
        </select>
      </Field>
      <label className="col-span-2 flex h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="isFavourite" defaultChecked={food?.isFavourite ?? false} className="size-5 accent-[var(--accent)]" />
        Favourite (shows in the Today quick row)
      </label>
      <div className="col-span-2 flex gap-2">
        <button type="submit" disabled={pending} className={`${primary} h-11 flex-1`}>{pending ? "Saving…" : food ? "Save" : "Add food"}</button>
        <button type="button" onClick={onDone} className={btn}>Cancel</button>
        {onArchive ? <button type="button" onClick={onArchive} className={`${btn} text-danger`}>Archive</button> : null}
      </div>
      {state && !state.ok ? <p className="col-span-2 text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}
