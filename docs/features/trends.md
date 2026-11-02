# Trends screen (`/trends`)

Answers "am I on track, and do I need to change anything?" before showing any detail.

## Layout
**Always on top**
1. **This week's verdict** (`weeklyVerdictFrom`, goal-aware): hold / eat slightly more / eat slightly less / tighten logging / not enough data, plus the reasons.
2. **Weight**: daily dots + 7-day average line (30d / 90d / All), kg and %/week, and a warning above the goal's limit (0.5 %/week recomp, 1 %/week fat loss).
3. **Navel vs goal** (only when the navel goal is set — the owner): a straight line from the start to the goal band on the goal date; "On track" / "Behind by X cm".
4. **Navel & waist log**: Log measurement form + the latest 4 entries ("Show all n").

**Promoted to the top only when relevant**
- **Checkpoint** (only when `checkpoint_date` is set): from 14 days before to 7 days after it.
- **Estimated maintenance**: when the suggested target (tdee + the goal's delta) differs from the current one by ≥ 50 kcal. It has an Apply button and is never applied automatically.

**Under "More details"** (a `<details>` element; still rendered on the server)
Goal progress % (navel goal set only), lifts (e1RM per exercise with stall runs; bodyweight exercises listed with their ladder rung and best set instead), **sets per muscle** (working sets per `exercises.muscle_group`, last 4
ISO weeks, back first), **cardio** (minutes per week for 8 weeks + a conditioning chart: pick a type, speed per entry over the last
180 days, incline labelled on each point, dot colour = effort), weekly protein / kcal adherence (12 weeks; sessions vs `weekly_session_target`), spend vs budget (budgets set only),
the checkpoint / maintenance card when not promoted, and the CSV export link.

## Files
| File | Role |
|---|---|
| `src/app/(app)/trends/page.tsx` | Loads every dataset once for the signed-in user, derives with the pure `*From` helpers, decides promotion and which owner-only cards exist |
| `trends/verdict-card.tsx`, `weight-section.tsx`, `navel-section.tsx`, `measurements.tsx` | Top cards |
| `trends/goal-card.tsx`, `lifts-section.tsx`, `muscle-volume.tsx`, `cardio-section.tsx`, `adherence-table.tsx`, `maintenance-card.tsx`, `checkpoint-card.tsx`, `spend-section.tsx` | Detail cards |
| `trends/actions.ts` | Measurement upsert/delete, `applyKcalTarget` |
| `src/lib/metrics/trends.ts` | Weight series, weekly rate, adherence, verdict, maintenance |
| `src/lib/metrics/checkpoint.ts`, `spend.ts`, `strength.ts` | Checkpoint summary (planned sessions = days ÷ 7 × weekly target), month spend, e1RM history (loaded lifts only), `bodyweightProgress`, `weeklySetsByMuscle` |
| `src/lib/activities.ts` | `cardioByWeek`, `loadCardioSince` |
| `src/components/charts/line-chart.tsx` | The SVG chart (series, band, marker, per-point colours/labels). Don't add a chart library |
