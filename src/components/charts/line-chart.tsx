/**
 * Dependency-free SVG line chart. Pure: safe in server and client components.
 * x is any number (we use epoch days, see `dayNum`); labels come from the caller.
 */
export type Point = { x: number; y: number };
export type Series = {
  id: string;
  points: Point[];
  /** Any CSS colour, including var(--accent). */
  color: string;
  strokeWidth?: number;
  dashed?: boolean;
  dots?: boolean;
  /** Draw the connecting line (default true). */
  line?: boolean;
  /** Per-point dot colour (same order as `points`); falls back to `color`. */
  pointColors?: (string | undefined)[];
  /** Per-point text drawn above the dot (e.g. "6%"). */
  pointLabels?: (string | undefined)[];
};
export type Band = { upper: Point[]; lower: Point[]; color?: string };
export type Tick = { x: number; label: string };

type Props = {
  series: Series[];
  band?: Band;
  xDomain?: [number, number];
  yDomain?: [number, number];
  xTicks?: Tick[];
  yTickCount?: number;
  yFormat?: (v: number) => string;
  /** Vertical marker (e.g. today). */
  markerX?: number;
  height?: number;
  ariaLabel?: string;
};

const W = 360;
const PAD = { top: 8, right: 8, bottom: 20, left: 36 };

export function dayNum(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

function extent(values: number[]): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo === Infinity ? [0, 1] : [lo, hi];
}

function niceStep(range: number, count: number): number {
  const raw = range / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}

function path(points: Point[], sx: (x: number) => number, sy: (y: number) => number): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
}

export function LineChart({ series, band, xDomain, yDomain, xTicks = [], yTickCount = 4, yFormat = (v) => String(v), markerX, height = 180, ariaLabel }: Props) {
  const allPts = [...series.flatMap((s) => s.points), ...(band ? [...band.upper, ...band.lower] : [])];
  const [x0, x1] = xDomain ?? extent(allPts.map((p) => p.x));
  let [y0, y1] = yDomain ?? extent(allPts.map((p) => p.y));
  if (!yDomain) {
    const pad = (y1 - y0 || 1) * 0.08;
    y0 -= pad;
    y1 += pad;
  }
  const step = niceStep(y1 - y0, yTickCount);
  const yTicks: number[] = [];
  for (let v = Math.ceil(y0 / step) * step; v <= y1 + 1e-9; v += step) yTicks.push(round(v));

  const iw = W - PAD.left - PAD.right;
  const ih = height - PAD.top - PAD.bottom;
  const sx = (x: number) => PAD.left + ((x - x0) / (x1 - x0 || 1)) * iw;
  const sy = (y: number) => PAD.top + (1 - (y - y0) / (y1 - y0 || 1)) * ih;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img" aria-label={ariaLabel} className="block overflow-visible text-[10px]">
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={sy(v)} y2={sy(v)} stroke="var(--border)" strokeWidth={1} />
          <text x={PAD.left - 6} y={sy(v)} textAnchor="end" dominantBaseline="middle" fill="var(--muted)">
            {yFormat(v)}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text key={t.x} x={sx(t.x)} y={height - 4} textAnchor="middle" fill="var(--muted)">
          {t.label}
        </text>
      ))}

      {band && band.upper.length > 1 && band.lower.length > 1 ? (
        <path
          d={`${path(band.upper, sx, sy)} ${path([...band.lower].reverse(), sx, sy).replace(/^M/, "L")} Z`}
          fill={band.color ?? "var(--accent)"}
          opacity={0.12}
        />
      ) : null}

      {markerX !== undefined ? (
        <line x1={sx(markerX)} x2={sx(markerX)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--muted)" strokeDasharray="2 3" strokeWidth={1} />
      ) : null}

      {series.map((s) => (
        <g key={s.id}>
          {s.line !== false && s.points.length > 1 ? (
            <path d={path(s.points, sx, sy)} fill="none" stroke={s.color} strokeWidth={s.strokeWidth ?? 2} strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
          ) : null}
          {s.dots || s.points.length === 1
            ? s.points.map((p, i) => <circle key={`${i}-${p.x}-${p.y}`} cx={sx(p.x)} cy={sy(p.y)} r={s.pointColors ? 3.5 : 2.5} fill={s.pointColors?.[i] ?? s.color} />)
            : null}
          {s.pointLabels
            ? s.points.map((p, i) =>
                s.pointLabels![i] ? (
                  <text key={`l${i}`} x={sx(p.x)} y={sy(p.y) - 7} textAnchor="middle" fill="var(--muted)">
                    {s.pointLabels![i]}
                  </text>
                ) : null,
              )
            : null}
        </g>
      ))}
    </svg>
  );
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Up to `max` evenly spaced date ticks labelled "d Mon". */
export function dateTicks(fromIso: string, toIso: string, max = 5): Tick[] {
  const a = dayNum(fromIso);
  const b = dayNum(toIso);
  if (b <= a) return [{ x: a, label: shortDate(fromIso) }];
  const n = Math.min(max, b - a + 1);
  const out: Tick[] = [];
  for (let i = 0; i < n; i++) {
    const x = Math.round(a + ((b - a) * i) / (n - 1));
    out.push({ x, label: shortDate(new Date(x * 86_400_000).toISOString().slice(0, 10)) });
  }
  return out;
}

const fmt = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short" });
export function shortDate(iso: string): string {
  return fmt.format(new Date(`${iso}T00:00:00Z`));
}
