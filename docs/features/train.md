# Train screen (`/train`)

Logging a lifting session by exception: confirm what repeated, and type only what progressed.

## What the owner sees
**Day unset:** the same "What's today?" picker as Today (a type per button, next up highlighted, days since, Rest, ⋯ Custom /
archived). Choosing a type creates the session. **Rest:** "Walk 8,000–10,000 steps" + Change. Past dates work via `?d=`.

**In a session:**
- Picker line (collapsed): the type name as the title + **Change** (switch type, Custom or Rest).
- Header: "n / m logged", **✓ All same as last time (k left)**, ⋯ (notes, discard). The old incline-walk checkbox is gone
  (column and data kept; a ticked legacy session counts as one cardio entry with no minutes).
- One line per exercise: name, a `stalled` badge, and the hint `last 45 × 10/10/9 → try 47.5` → **✓** button.
  - ✓ copies last session's working sets for that exercise. The line then turns green: `✓ 45 kg × 10/10/9`.
  - Tapping the name opens the set grid (kg × reps per set, placeholders from last session, ± set), the stall advice and the cues.
- **+ Add an exercise**: search the full library or create a new one (with a muscle group). "Also add to <type>" (off by default)
  appends it to the type's list too (3 × 8).
- **Cardio** (below the workout, or on its own on rest/unset days): see [cardio.md](cardio.md).

## Behaviour rules
- **Choosing a type writes no sets** (`setDayPlan` → `createSession`). It copies the type's exercises into `session_exercises`.
  An exercise counts as done only after ✓ or typed sets, so skipped exercises don't pollute the e1RM history.
- Changing the day: an empty session is replaced. If it has sets, the picker asks first, then retypes the session and keeps
  the logged exercises (Rest keeps the session too). Rest wins over any session in DayState.
- `copyLastSets(sessionId, exerciseIds?)` (`src/lib/training.ts`) is the single "same as last time" write. It skips
  exercises that already have sets. It's used by ✓, by ✓ All same, by the bot's `done` and by the day-close button.
- "Last session" = the most recent session containing that exercise (any workout type), working sets only.
- Next up = the active type after the most recently trained one (rotation = Settings order). See `docs/rules-engine.md`.
- Hint (`hintFromSets`): every target rep hit → +2.5 kg upper body / +5 kg lower body; otherwise same weight, add reps.
- Stall = no new best e1RM (Epley) for ≥ 3 sessions → badge + "drop ~10 % and rebuild, or swap the variation".
- Lat cues are stored on the exercise rows (`exercises.cues`) and shown collapsed.
- `workoutLogged` (DayState) = ≥ 1 set or a legacy incline-walk tick.

## Files
| File | Role |
|---|---|
| `src/app/(app)/train/page.tsx` | `getTrainData(date)` → DayPicker (+ SessionView when a session exists) + Activities |
| `src/components/day-picker.tsx`, `src/app/(app)/day-actions.ts` | Day picker and `chooseDay` (shared with Today) |
| `train/session-view.tsx` | Header, `ExerciseRow` (collapsed line + set grid), `AddExercise` |
| `train/cardio.tsx` | Cardio section (repeat, type picker, per-type form, entries) |
| `train/actions.ts` | `sameAsLast`, `upsertSet`, `deleteSet`, `addExerciseToSession`, `setInclineWalk`, `saveSessionNotes`, `discardSession`, `addCardio`, `editCardio`, `removeCardio`, `repeatCardio` |
| `src/lib/training.ts` | `listWorkoutTypes`, `setDayPlan`, `getSessionDetail`, `createSession`, `copyLastSets`, `addExerciseToType`, `sessionProgress`, `findOrCreateExercise` |
| `src/lib/metrics/strength.ts` | `e1rm`, history loaders, `hintFromSets`, `stallFromHistory` |

## Gotcha
`ExerciseRow` keeps local row state. When sets arrive from the server (✓ / All same) and nothing has been saved locally,
it adopts them (the render-time `prevSig` check). Don't key rows on set count, because that remounts them mid-edit.
