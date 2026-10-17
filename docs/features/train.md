# Train screen (`/train`)

Logging a lifting session by exception: confirm what repeated, and type only what progressed.

## What the owner sees
**Before starting:** the training day name + exercise preview + a big **Start Upper A** button. On a rest day it shows the step target.
"Other workout…" / "Train anyway…" opens the other routine days + **Free workout** (no routine).

**In a session:**
- Header: title, "n / m logged", **✓ All same as last time (k left)**, incline-walk checkbox, ⋯ (notes, discard).
- One line per exercise: name, a `stalled` badge, and the hint `last 45 × 10/10/9 → try 47.5` → **✓** button.
  - ✓ copies last session's working sets for that exercise. The line then turns green: `✓ 45 kg × 10/10/9`.
  - Tapping the name opens the set grid (kg × reps per set, placeholders from last session, ± set), the stall advice and the cues.
- **+ Add an exercise**: pick an existing one or create a custom one (with a muscle group). It's added to this session only.
- **Other activity (sport, cardio)**: name + minutes.

## Behaviour rules
- **Start writes no sets.** It copies the routine's exercises into `session_exercises`. An exercise counts as done only
  after ✓ or typed sets, so skipped exercises don't pollute the e1RM history.
- `copyLastSets(sessionId, exerciseIds?)` (`src/lib/training.ts`) is the single "same as last time" write. It skips
  exercises that already have sets. It's used by ✓, by ✓ All same, by the bot's `done` and by the day-close button.
- "Last session" = the most recent session containing that exercise (any routine day), working sets only.
- Hint (`hintFromSets`): every target rep hit → +2.5 kg upper body / +5 kg lower body; otherwise same weight, add reps.
- Stall = no new best e1RM (Epley) for ≥ 3 sessions → badge + "drop ~10 % and rebuild, or swap the variation".
- Lat cues are stored on the exercise rows (`exercises.cues`) and shown collapsed.
- `workoutLogged` (DayState) = ≥ 1 set or incline walk.

## Files
| File | Role |
|---|---|
| `src/app/(app)/train/page.tsx` | `getTrainData(date)` → StartSession or SessionView + Activities |
| `train/start-session.tsx` | Start card, other day / free workout |
| `train/session-view.tsx` | Header, `ExerciseRow` (collapsed line + set grid), `AddExercise` |
| `train/activities.tsx` | Activity quick add |
| `train/actions.ts` | `startSession`, `sameAsLast`, `upsertSet`, `deleteSet`, `addExerciseToSession`, `setInclineWalk`, `saveSessionNotes`, `discardSession`, activities |
| `src/lib/training.ts` | `getSessionDetail`, `createSession`, `copyLastSets`, `findOrCreateExercise` |
| `src/lib/metrics/strength.ts` | `e1rm`, history loaders, `hintFromSets`, `stallFromHistory` |

## Gotcha
`ExerciseRow` keeps local row state. When sets arrive from the server (✓ / All same) and nothing has been saved locally,
it adopts them (the render-time `prevSig` check). Don't key rows on set count, because that remounts them mid-edit.
