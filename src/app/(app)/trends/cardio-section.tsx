"use client";

import { useMemo, useState } from "react";
import { dateTicks, dayNum, LineChart, shortDate } from "@/components/charts/line-chart";
import { CARDIO_TYPES, EFFORTS, type CardioEntry, type CardioType, type Effort } from "@/lib/cardio";
import { Section } from "./section";

const EFFORT_COLOR: Record<Effort, string> = { easy: "var(--muted)", moderate: "var(--accent)", hard: "var(--danger)" };

/** Weekly cardio minutes (last 8 weeks) and a conditioning chart: speed per entry for one type, incline labelled, effort coloured. No calorie estimates. */
export function CardioSection({ weeks, entries }: { weeks: { weekStart: string; minutes: number }[]; entries: CardioEntry[] }) {
  const withSpeed = useMemo(() => entries.filter((e) => e.speedKmh !== null), [entries]);
  const types = useMemo(() => {
    const counts = new Map<CardioType, number>();
    for (const e of withSpeed) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [withSpeed]);
  const [type, setType] = useState<CardioType | null>(types[0] ?? null);
  const points = withSpeed.filter((e) => e.type === type);
  const max = Math.max(1, ...weeks.map((w) => w.minutes));
  const oldestFirst = [...weeks].reverse();

  return (
    <Section title="Cardio" aside={<span className="text-xs text-muted">minutes / week</span>}>
      <ul className="flex flex-col gap-1.5">
        {oldestFirst.map((w) => (
          <li key={w.weekStart} className="grid grid-cols-[3.5rem_1fr_3rem] items-center gap-2 text-xs tabular-nums">
            <span className="text-muted">{shortDate(w.weekStart)}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-border">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${(w.minutes / max) * 100}%` }} />
            </span>
            <span className="text-right">{w.minutes}</span>
          </li>
        ))}
      </ul>

      <h3 className="mt-5 text-sm font-medium">Conditioning</h3>
      {types.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Log speed or distance (walk, run, incline walk, cycle…) to see speed over time.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            {types.map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} className={`h-9 rounded-lg border px-3 text-xs font-medium ${t === type ? "border-accent bg-accent text-accent-fg" : "border-border"}`}>
                {CARDIO_TYPES[t].label}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <LineChart
              ariaLabel={`${type ? CARDIO_TYPES[type].label : ""} speed per entry`}
              height={170}
              xTicks={points.length ? dateTicks(points[0].date, points[points.length - 1].date, 4) : []}
              yFormat={(v) => v.toFixed(1)}
              series={[
                {
                  id: "speed",
                  points: points.map((e) => ({ x: dayNum(e.date), y: e.speedKmh! })),
                  color: "var(--border)",
                  strokeWidth: 1.5,
                  dots: true,
                  pointColors: points.map((e) => (e.effort ? EFFORT_COLOR[e.effort] : "var(--fg)")),
                  pointLabels: points.map((e) => (e.inclinePct !== null ? `${e.inclinePct}%` : undefined)),
                },
              ]}
            />
          </div>
          <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
            <span>km/h per entry{type === "incline_walk" ? " · labels = incline" : ""}</span>
            {EFFORTS.map((x) => (
              <span key={x} className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-full" style={{ background: EFFORT_COLOR[x] }} />
                {x}
              </span>
            ))}
          </p>
        </>
      )}
    </Section>
  );
}
