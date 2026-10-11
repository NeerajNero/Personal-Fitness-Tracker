"use client";

import { useState } from "react";
import { dateTicks, dayNum, LineChart } from "@/components/charts/line-chart";
import { addDays } from "@/lib/dates";
import type { WeeklyRate, WeightPoint } from "@/lib/metrics/trends";
import { Section } from "./section";

type Range = 30 | 90 | "all";

export function WeightSection({ series, rate, today }: { series: WeightPoint[]; rate: WeeklyRate | null; today: string }) {
  const [range, setRange] = useState<Range>(30);
  const from = range === "all" ? (series[0]?.date ?? today) : addDays(today, -(range - 1));
  const visible = series.filter((p) => p.date >= from);

  const toggle = (
    <div className="flex rounded-lg border border-border p-0.5 text-xs">
      {([30, 90, "all"] as Range[]).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => setRange(r)}
          className={`h-7 rounded-md px-2.5 font-medium ${range === r ? "bg-accent text-accent-fg" : "text-muted"}`}
        >
          {r === "all" ? "All" : `${r}d`}
        </button>
      ))}
    </div>
  );

  return (
    <Section title="Weight" aside={toggle}>
      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No weigh-ins {range === "all" ? "yet" : "in this range"}.</p>
      ) : (
        <LineChart
          ariaLabel="Daily weight and 7-day average"
          xDomain={[dayNum(from), dayNum(today)]}
          xTicks={dateTicks(from, today, range === 30 ? 5 : 4)}
          yFormat={(v) => v.toFixed(1)}
          series={[
            { id: "daily", points: visible.map((p) => ({ x: dayNum(p.date), y: p.weightKg })), color: "var(--muted)", line: false, dots: true },
            { id: "avg7", points: visible.map((p) => ({ x: dayNum(p.date), y: p.avg7 })), color: "var(--accent)", strokeWidth: 2.5 },
          ]}
        />
      )}

      <div className="mt-3 text-sm">
        {rate ? (
          <>
            <p>
              <span className="font-medium">{rate.kgPerWeek > 0 ? "+" : ""}{rate.kgPerWeek.toFixed(2)} kg/week</span>
              <span className="text-muted"> · {rate.pctPerWeek > 0 ? "+" : ""}{rate.pctPerWeek.toFixed(2)} %/week · 7-day avg {rate.latest.avg7.toFixed(1)} kg</span>
            </p>
            {rate.tooFast ? (
              <p className="mt-1 font-medium text-danger">Losing faster than 0.5 %/week — eat slightly more to protect muscle.</p>
            ) : null}
          </>
        ) : (
          <p className="text-muted">Weekly rate appears after about a week of weigh-ins.</p>
        )}
      </div>
    </Section>
  );
}
