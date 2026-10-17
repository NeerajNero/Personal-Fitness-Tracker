# Trends screen (`/trends`)

Answers "am I on track, and do I need to change anything?" before showing any detail.

## Layout
**Always on top**
1. **This week's verdict** (`weeklyVerdictFrom`): hold / eat slightly more / eat slightly less / tighten logging / not enough data, plus the reasons.
2. **Weight**: daily dots + 7-day average line (30d / 90d / All), kg and %/week, and a warning above 0.5 %/week.
3. **Navel vs goal**: a straight line from the start to the 76–78 cm band on 2027-10-11; "On track" / "Behind by X cm".
4. **Navel & waist log**: Log measurement form + the latest 4 entries ("Show all n").

**Promoted to the top only when relevant**
- **Dec 10 checkpoint**: from 14 days before to 7 days after `checkpoint_date`.
- **Estimated maintenance**: when the suggested target differs from the current one by ≥ 50 kcal. It has an Apply button and is never applied automatically.

**Under "More details"** (a `<details>` element; still rendered on the server)
Goal progress %, lifts (e1RM per exercise with stall runs), weekly protein / kcal adherence (12 weeks), spend vs budget,
the checkpoint / maintenance card when not promoted, and the CSV export link.

## Files
| File | Role |
|---|---|
| `src/app/(app)/trends/page.tsx` | Loads every dataset once, derives with the pure `*From` helpers, decides promotion |
| `trends/verdict-card.tsx`, `weight-section.tsx`, `navel-section.tsx`, `measurements.tsx` | Top cards |
| `trends/goal-card.tsx`, `lifts-section.tsx`, `adherence-table.tsx`, `maintenance-card.tsx`, `checkpoint-card.tsx`, `spend-section.tsx` | Detail cards |
| `trends/actions.ts` | Measurement upsert/delete, `applyKcalTarget` |
| `src/lib/metrics/trends.ts` | Weight series, weekly rate, adherence, verdict, maintenance |
| `src/lib/metrics/checkpoint.ts`, `spend.ts`, `strength.ts` | Checkpoint summary, month spend, e1RM history |
| `src/components/charts/line-chart.tsx` | The SVG chart (series, band, marker). Don't add a chart library |
