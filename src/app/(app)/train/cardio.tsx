"use client";

import { useState, useTransition, type FormEvent } from "react";
import { CARDIO_TYPE_KEYS, CARDIO_TYPES, EFFORTS, cardioSummary, type CardioEntry, type CardioInput, type CardioType, type Effort } from "@/lib/cardio";
import { addCardio, editCardio, removeCardio, repeatCardio } from "./actions";

const field = "h-12 w-full min-w-0 rounded-xl border border-border bg-bg px-3 outline-none focus:border-accent";
const chip = "h-10 rounded-xl border px-3 text-sm font-medium active:opacity-70 disabled:opacity-50";

/** Cardio for the date: one-tap repeat of the most recent entry, a type picker that opens only that type's fields, and the day's entries. */
export function Cardio({ date, entries, last }: { date: string; entries: CardioEntry[]; last: CardioEntry | null }) {
  const [adding, setAdding] = useState<CardioType | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Failed");
      else after?.();
    });
  };

  return (
    <section id="cardio" className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted">Cardio</h2>

      {last ? (
        <button type="button" disabled={pending} onClick={() => run(() => repeatCardio(date))} className="min-h-12 rounded-xl border border-accent bg-accent/10 px-4 py-2 text-left text-sm font-medium text-accent active:opacity-70 disabled:opacity-50">
          ↺ Same as last time: {cardioSummary(last)}
        </button>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {CARDIO_TYPE_KEYS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setEditingId(null);
              setAdding(adding === t ? null : t);
            }}
            className={`${chip} ${adding === t ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface"}`}
          >
            {CARDIO_TYPES[t].label}
          </button>
        ))}
      </div>

      {adding ? (
        <CardioForm key={adding} type={adding} pending={pending} onCancel={() => setAdding(null)} onSubmit={(input) => run(() => addCardio(date, input), () => setAdding(null))} />
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {entries.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {entries.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => { setAdding(null); setEditingId(editingId === e.id ? null : e.id); }} className="flex min-h-12 w-full items-center px-4 py-2 text-left text-sm">
                <span className="min-w-0 flex-1">
                  {cardioSummary(e)}
                  {e.notes ? <span className="block text-xs text-muted">{e.notes}</span> : null}
                </span>
              </button>
              {editingId === e.id ? (
                <div className="px-3 pb-3">
                  <CardioForm
                    type={e.type}
                    initial={e}
                    pending={pending}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => run(() => removeCardio(e.id), () => setEditingId(null))}
                    onSubmit={(input) => run(() => editCardio(e.id, input), () => setEditingId(null))}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function CardioForm({
  type,
  initial,
  pending,
  onSubmit,
  onCancel,
  onDelete,
}: {
  type: CardioType;
  initial?: CardioEntry;
  pending: boolean;
  onSubmit: (input: CardioInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const cfg = CARDIO_TYPES[type];
  const [effort, setEffort] = useState<Effort | null>(initial?.effort ?? null);
  const has = (f: string) => (cfg.fields as string[]).includes(f);
  const str = (n: number | null | undefined) => (n == null ? "" : String(n));

  function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "");
    onSubmit({
      type,
      minutes: get("minutes"),
      name: has("name") ? get("name") : null,
      distanceKm: has("distance") ? get("distanceKm") : null,
      speedKmh: has("speed") ? get("speedKmh") : null,
      inclinePct: has("incline") ? get("inclinePct") : null,
      effort,
      notes: get("notes"),
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3">
      {has("name") ? <input name="name" required maxLength={60} defaultValue={initial?.type === "sport" ? initial.name : ""} placeholder="Sport (badminton, football…)" className={field} /> : null}
      <div className="grid grid-cols-3 gap-2">
        <input name="minutes" type="number" inputMode="numeric" min={1} max={300} required defaultValue={str(initial?.minutes)} placeholder="min" aria-label="Minutes" className={field} />
        {has("distance") ? <input name="distanceKm" type="number" inputMode="decimal" step="0.01" min={0.1} max={100} defaultValue={str(initial?.distanceKm)} placeholder="km" aria-label="Distance (km)" className={field} /> : null}
        {has("speed") ? <input name="speedKmh" type="number" inputMode="decimal" step="0.1" min={1} max={25} defaultValue={str(initial?.speedKmh)} placeholder="km/h" aria-label="Speed (km/h)" className={field} /> : null}
        {has("incline") ? <input name="inclinePct" type="number" inputMode="decimal" step="0.5" min={0} max={30} defaultValue={str(initial?.inclinePct)} placeholder="incline %" aria-label="Incline (%)" className={field} /> : null}
      </div>
      {cfg.speedOrDistance ? <p className="text-xs text-muted">Distance or speed: either one; the other (and pace) is worked out.</p> : null}
      <div className="flex gap-2">
        {EFFORTS.map((x) => (
          <button key={x} type="button" aria-pressed={effort === x} onClick={() => setEffort(effort === x ? null : x)} className={`${chip} flex-1 ${effort === x ? "border-accent bg-accent text-accent-fg" : "border-border bg-bg"}`}>
            {x}
          </button>
        ))}
      </div>
      <input name="notes" maxLength={200} defaultValue={initial?.notes ?? ""} placeholder="Note (optional)" className={field} />
      <div className="flex gap-2">
        {onDelete ? (
          <button type="button" onClick={onDelete} className="h-11 px-3 text-sm font-medium text-danger active:opacity-70">
            Delete
          </button>
        ) : null}
        <span className="flex-1" />
        <button type="button" onClick={onCancel} className="h-11 rounded-xl border border-border px-4 text-sm active:opacity-70">
          Cancel
        </button>
        <button type="submit" disabled={pending} className="h-11 rounded-xl bg-accent px-5 text-sm font-medium text-accent-fg active:opacity-80 disabled:opacity-60">
          {initial ? "Save" : `Add ${cfg.label.toLowerCase()}`}
        </button>
      </div>
    </form>
  );
}
