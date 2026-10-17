"use client";

import { useOptimistic, useState, useTransition, type FormEvent } from "react";
import type { Measurement } from "@/db/schema";
import { shortDate } from "@/components/charts/line-chart";
import { deleteMeasurement, upsertMeasurement } from "./actions";
import { Section } from "./section";

type Row = Pick<Measurement, "id" | "date" | "navelCm" | "waistCm">;
type Op = { type: "upsert"; row: Row } | { type: "delete"; id: number };

function reducer(list: Row[], op: Op): Row[] {
  if (op.type === "delete") return list.filter((r) => r.id !== op.id);
  const rest = list.filter((r) => r.date !== op.row.date);
  return [...rest, op.row].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

let tempId = -1;
const input = "h-12 rounded-xl border border-border bg-bg px-3 outline-none focus:border-accent";

export function Measurements({ items, today }: { items: Measurement[]; today: string }) {
  const [list, dispatch] = useOptimistic<Row[], Op>(items, reducer);
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const fd = new FormData(form);
    const v = {
      date: String(fd.get("date") ?? today),
      navelCm: String(fd.get("navelCm") ?? ""),
      waistCm: String(fd.get("waistCm") ?? ""),
      notes: "",
    };
    setError(null);
    startTransition(async () => {
      dispatch({
        type: "upsert",
        row: { id: tempId--, date: v.date, navelCm: v.navelCm === "" ? null : Number(v.navelCm), waistCm: v.waistCm === "" ? null : Number(v.waistCm) },
      });
      const r = await upsertMeasurement(v);
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
      const r = await deleteMeasurement(id);
      if (!r.ok) setError(r.error);
    });
  }

  const newest = [...list].reverse();
  const shown = showAll ? newest : newest.slice(0, 4);

  return (
    <Section
      title="Navel & waist log"
      aside={
        <button type="button" onClick={() => setOpen((v) => !v)} className={`h-9 rounded-lg px-3 text-sm font-medium ${open ? "text-muted" : "text-accent"}`}>
          {open ? "Close" : "Log measurement"}
        </button>
      }
    >
      {open ? (
        <form onSubmit={submit} className="mb-3 grid grid-cols-2 gap-2">
          <input name="date" type="date" defaultValue={today} max={today} required className={`${input} col-span-2`} />
          <input name="navelCm" type="number" inputMode="decimal" step="0.1" min={40} max={200} placeholder="Navel cm" className={input} />
          <input name="waistCm" type="number" inputMode="decimal" step="0.1" min={40} max={200} placeholder="Waist cm" className={input} />
          <button type="submit" className="col-span-2 h-12 rounded-xl bg-accent font-medium text-accent-fg active:opacity-80">
            Save
          </button>
        </form>
      ) : null}

      {newest.length === 0 ? (
        <p className="text-sm text-muted">No measurements yet. Navel at the belly button, relaxed, same time each week.</p>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((m) => (
            <li key={m.id} className={`flex h-12 items-center gap-3 ${m.id < 0 ? "opacity-60" : ""}`}>
              <span className="w-20 text-sm text-muted">{shortDate(m.date)}</span>
              <span className="flex-1 text-sm tabular-nums">
                {m.navelCm !== null ? <>navel <span className="font-medium">{m.navelCm}</span></> : null}
                {m.navelCm !== null && m.waistCm !== null ? <span className="text-muted"> · </span> : null}
                {m.waistCm !== null ? <>waist <span className="font-medium">{m.waistCm}</span></> : null}
              </span>
              <button type="button" onClick={() => remove(m.id)} disabled={m.id < 0} aria-label={`Delete ${m.date}`} className="flex size-10 items-center justify-center text-lg text-muted active:opacity-70 disabled:opacity-40">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {newest.length > 4 ? (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 h-10 text-sm text-accent active:opacity-70">
          {showAll ? "Show fewer" : `Show all ${newest.length}`}
        </button>
      ) : null}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </Section>
  );
}
