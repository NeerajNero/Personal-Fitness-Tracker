"use client";

import { useOptimistic, useState, useTransition, type FormEvent } from "react";
import type { Activity } from "@/lib/training";
import { addActivity, deleteActivity } from "./actions";

type Act = Pick<Activity, "id" | "name" | "minutes" | "notes">;
type Op = { type: "add"; item: Act } | { type: "delete"; id: number };

function reducer(list: Act[], op: Op): Act[] {
  return op.type === "add" ? [...list, op.item] : list.filter((a) => a.id !== op.id);
}

let tempId = -1;

export function Activities({ date, activities }: { date: string; activities: Activity[] }) {
  const [list, dispatch] = useOptimistic<Act[], Op>(activities, reducer);
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const fd = new FormData(form);
    const input = { name: String(fd.get("name") ?? ""), minutes: String(fd.get("minutes") ?? ""), notes: String(fd.get("notes") ?? "") };
    setError(null);
    startTransition(async () => {
      dispatch({ type: "add", item: { id: tempId--, name: input.name, minutes: Number(input.minutes) || 0, notes: input.notes || null } });
      const r = await addActivity(date, input);
      if (r.ok) {
        form.reset();
        setOpen(false);
      } else setError(r.error);
    });
  }

  function remove(id: number) {
    setError(null);
    startTransition(async () => {
      dispatch({ type: "delete", id });
      const r = await deleteActivity(id);
      if (!r.ok) setError(r.error);
    });
  }

  const input = "h-12 rounded-xl border border-border bg-bg px-3 outline-none focus:border-accent";

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted">Activities</h2>
        <button type="button" onClick={() => setOpen((v) => !v)} className={`h-9 rounded-lg px-3 text-sm font-medium ${open ? "text-muted" : "text-accent"}`}>
          {open ? "Close" : "+ Activity"}
        </button>
      </div>

      {open ? (
        <form onSubmit={submit} className="mb-3 grid grid-cols-[1fr_5.5rem] gap-2 rounded-2xl border border-border bg-surface p-3">
          <input name="name" required maxLength={60} placeholder="Badminton, cycling…" className={input} />
          <input name="minutes" type="number" inputMode="numeric" min={1} max={600} required placeholder="min" className={input} />
          <input name="notes" maxLength={200} placeholder="Note (optional)" className={`${input} col-span-2`} />
          <button type="submit" className="col-span-2 h-12 rounded-xl bg-accent font-medium text-accent-fg active:opacity-80">
            Add
          </button>
        </form>
      ) : null}

      {list.length === 0 ? (
        !open ? <p className="rounded-2xl border border-dashed border-border p-3 text-center text-sm text-muted">No activities.</p> : null
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {list.map((a) => (
            <li key={a.id} className={`flex min-h-12 items-center gap-3 pl-4 pr-2 ${a.id < 0 ? "opacity-60" : ""}`}>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{a.name}</span>
                {a.notes ? <span className="ml-2 text-xs text-muted">{a.notes}</span> : null}
              </span>
              <span className="text-sm text-muted tabular-nums">{a.minutes} min</span>
              <button type="button" onClick={() => remove(a.id)} disabled={a.id < 0} aria-label={`Delete ${a.name}`} className="flex size-10 items-center justify-center text-lg text-muted active:opacity-70 disabled:opacity-40">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </section>
  );
}
