# Cardio log

Every non-lifting activity: incline walks, walks, runs, cycling, cross-trainer, swims, stairs and sports. Logging
one should be a single tap ("same as last time") or one bot message. **No calorie-burn estimates anywhere** (non-goal).

## Types (`CARDIO_TYPES` in `src/lib/cardio.ts`)
| Type | Fields besides minutes | Notes |
|---|---|---|
| Incline walk | speed (km/h), incline (%) | distance derived from speed × time |
| Walk, Run | distance (km) **or** speed (km/h), one required | the other is derived; pace (min/km) shown with speed |
| Cycle, Cross-trainer, Swim | optional distance | speed derived when distance is given |
| Stairs | none | |
| Sport | name | stored in `activities.name`; legacy rows are sports |

Every type also has an optional effort (easy / moderate / hard) and an optional note.
Validation (`cardioInputSchema`, shared by app and bot): minutes 1–300, speed 1–25, incline 0–30, distance 0.1–100.
`normalizeCardio` drops fields a type doesn't show and derives speed ⇄ distance, so both are stored whenever possible.

## Where it shows
- **Train → Cardio** (below the workout, or on its own on rest/unset days): "↺ Same as last time: Incline walk 20 min ·
  4.5 km/h · 6%" (the most recent entry on or before the date, copied with the current time) · type chips that open only
  that type's fields · the day's entries (tap to edit or delete).
- **Today**: one line under the day picker. "Cardio: 20 min incline walk" when logged, otherwise "+ Cardio" with the repeat.
- **Bot**: `incline 20 4.5 6%`, `walk 30 5`, `run 25 4.2km hard`, `bike 40 15km`, `cross 20`, `stairs 10`, `swim 30`,
  `sport badminton 45`, `cardio` (repeat), `undo` (newest food or cardio). See [telegram-bot.md](telegram-bot.md).
- **Reminders**: a day-close button "＋ <last entry>" when nothing is logged today; cardio minutes in the weekly report.
- **Trends → More details → Cardio**: minutes per week (8 weeks) and the conditioning chart (speed per entry for one type,
  incline labels, effort colours).
- DayState: `cardio { minutes, entries, lastEntry }` (see [../rules-engine.md](../rules-engine.md)).

## Files
| File | Role |
|---|---|
| `src/lib/cardio.ts` | Client-safe: types config, `cardioInputSchema`, `normalizeCardio`, `pace`, `cardioSummary`, `cardioDayLine`, bot `parseCardio` |
| `src/lib/activities.ts` | Server: `listCardio`, `lastCardio`, `insertCardio`, `updateCardio`, `deleteCardio`, `repeatLastCardio`, `latestCardioOn`, `cardioByWeek`, `loadCardioSince` |
| `src/app/(app)/train/cardio.tsx` | Train section + per-type form |
| `src/app/(app)/today/cardio-line.tsx` | Today line |
| `src/app/(app)/trends/cardio-section.tsx` | Weekly minutes + conditioning chart |
| `src/app/(app)/train/actions.ts` | `addCardio`, `editCardio`, `removeCardio`, `repeatCardio` |
| `src/lib/telegram/ops.ts` | `opCardio`, `opCardioRepeat`, `opUndo` |
