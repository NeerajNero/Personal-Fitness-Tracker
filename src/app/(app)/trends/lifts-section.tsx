"use client";

import { useState } from "react";
import { dateTicks, dayNum, LineChart } from "@/components/charts/line-chart";
import type { HistoryPoint, Stall } from "@/lib/metrics/strength";
import { Section } from "./section";

export type Lift = {
  exerciseId: number;
  name: string;
  points: HistoryPoint[];
  stall: Stall;
  stallIdx: number[];
  first: number;
  latest: number;
  deltaPct: number;
};

export function LiftsSection({ lifts }: { lifts: Lift[] }) {
  const [selected, setSelected] = useState<number | null>(lifts[0]?.exerciseId ?? null);
  const lift = lifts.find((l) => l.exerciseId === selected) ?? lifts[0];

  if (!lift) {
    return (
      <Section title="Lifts">
        <p className="text-sm text-muted">Charts appear once an exercise has two logged sessions.</p>
      </Section>
    );
  }

  const stallSet = new Set(lift.stallIdx);
  const from = lift.points[0].date;
  const to = lift.points[lift.points.length - 1].date;

  return (
    <Section
      title="Lifts"
      aside={
        <select
          value={lift.exerciseId}
          onChange={(e) => setSelected(Number(e.target.value))}
          className="h-9 max-w-[11rem] rounded-lg border border-border bg-bg px-2 text-sm"
          aria-label="Exercise"
        >
          {lifts.map((l) => (
            <option key={l.exerciseId} value={l.exerciseId}>
              {l.name}
            </option>
          ))}
        </select>
      }
    >
      <LineChart
        ariaLabel={`Best estimated 1RM per session for ${lift.name}`}
        height={160}
        xTicks={dateTicks(from, to, 4)}
        yFormat={(v) => `${Math.round(v)}`}
        series={[
          { id: "e1rm", points: lift.points.map((p) => ({ x: dayNum(p.date), y: p.e1rm })), color: "var(--accent)", dots: true },
          { id: "stall", points: lift.points.filter((_, i) => stallSet.has(i)).map((p) => ({ x: dayNum(p.date), y: p.e1rm })), color: "var(--warn)", line: false, dots: true },
        ]}
      />
      <p className="mt-1 text-xs text-muted">
        Best set e1RM (Epley) per session. {lift.stall.stalled ? <span className="text-warn">Stalled ×{lift.stall.count} — amber points are the stall run.</span> : null}
      </p>

      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-[11px] font-medium text-muted">
          <tr>
            <th className="pb-2 font-medium">Exercise</th>
            <th className="pb-2 text-right font-medium">First</th>
            <th className="pb-2 text-right font-medium">Latest</th>
            <th className="pb-2 text-right font-medium">Δ</th>
            <th className="pb-2 text-right font-medium">Sess.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lifts.map((l) => (
            <tr key={l.exerciseId} className={`h-10 ${l.exerciseId === lift.exerciseId ? "font-medium" : ""}`}>
              <td className="pr-2">
                <span className="line-clamp-1">{l.name}</span>
                {l.stall.stalled ? <span className="rounded-full bg-warn/15 px-1.5 text-[10px] font-medium text-warn">Stalled ×{l.stall.count}</span> : null}
              </td>
              <td className="text-right tabular-nums">{Math.round(l.first)}</td>
              <td className="text-right tabular-nums">{Math.round(l.latest)}</td>
              <td className={`text-right tabular-nums ${l.deltaPct > 0 ? "text-accent" : l.deltaPct < 0 ? "text-danger" : "text-muted"}`}>
                {l.deltaPct > 0 ? "+" : ""}{l.deltaPct}%
              </td>
              <td className="text-right tabular-nums text-muted">{l.points.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
