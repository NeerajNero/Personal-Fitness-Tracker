# Home program: ladders, the plan, the rules

Read this before touching bodyweight progression, the Day A/B/C plan, the finisher, or the exercise library's
pattern / equipment / ladder columns. Gym users' screens and rules are unchanged by any of this.

## Library model (`exercises`, migration 0010, seeded by `pnpm seed` from `src/lib/library.ts`)
- `pattern`: horizontal_push, vertical_push, horizontal_pull, vertical_pull, squat, hinge, lunge, core_brace,
  core_lateral, calves, conditioning, isolation. Gym rows are classified too (vertical_pull and isolation exist for them).
- `equipment` text[]: none, dumbbells, bands, pullup_bar, or gym. Household items (chair, table, wall, step) count as
  none. Custom exercises have `{}` (unknown). "Bodyweight" in the code means `'none' = any(equipment)`.
- `measure`: reps, or seconds for holds. **Seconds are stored in `sets.reps`** (one column, one copy path); the UI and the
  hints label them.
- `ladder` + `ladder_level`: the progression a rung belongs to and its 1-based position. Siblings are the other rows with
  the same `ladder`.
- The e1RM view (`v_e1rm_by_exercise`) leaves bodyweight exercises out; Trends → Lifts shows their rung and best set instead.

## The ladders as seeded (easiest → hardest; every rung has its own cue)
| Ladder | Pattern | Measure | Rungs |
|---|---|---|---|
| push_up | horizontal_push | reps | Wall push-up → Incline push-up (table) → Knee push-up → Push-up → Decline push-up (feet on chair) → Archer push-up |
| pike | vertical_push | reps | Knee pike push-up → Pike push-up → Elevated pike push-up |
| row | horizontal_pull | reps | Table row, knees bent → Table row, legs straight → Table row, feet raised (each cue says how to check the table) |
| squat | squat | reps | Chair squat → Bodyweight squat → Pause squat (3 s) → Split squat → Bulgarian split squat (chair) → Doorframe-assisted pistol |
| hinge | hinge | reps | Glute bridge → Single-leg glute bridge → Single-leg RDL → Hamstring walkout |
| lunge | lunge | reps | Reverse lunge → Walking lunge (bodyweight) → Step-up (chair) → High step-up |
| plank | core_brace | seconds | Knee plank → Plank → Long-lever plank → Plank with shoulder taps |
| side_plank | core_lateral | seconds | Knee side plank → Side plank → Side plank hip dip → Side plank leg lift |
| core | core_brace | seconds for holds | Dead bug (reps) → Hollow hold → Hollow rock (reps) → Reverse crunch (reps) |
| wall_sit | squat | seconds | Wall sit → Single-leg wall sit |
| calves | calves | reps | Calf raise on a step → Single-leg calf raise |
Conditioning (no ladder, no sets): Jumping jacks, High knees, Mountain climbers, Burpees, Skaters, Shadow boxing, Stair climbs.

## Progression (`bodyweightHint` in `src/lib/metrics/strength.ts`, chosen per exercise when it is bodyweight)
Rep range 8–15; holds 20–45 s. From the last three sessions **on this rung** (newest first), in this order:
1. Every working set at the top (and at least the target number of sets) → **up**: "3 × 15/15/15 last time, move to
   Push-up next time". The type's row advances to that rung on the next Start (`advanceLadders` in `createSession`);
   the old sessions keep the old rung through `session_exercises`, so history is never rewritten.
2. A set under the bottom in each of the last two sessions → **down**: "Two sessions under 8, try Incline push-up (table)
   next time". A suggestion only; the user moves the rung in Settings.
3. Three sessions with no rise in total reps (seconds) → **stall**: "try a 3-second lowering or one extra set". The row
   shows the Stalled badge.
4. Otherwise → add to the weakest set: "3 × 12/12/11 last time, aim for 13s" (+2 reps, +5 s for holds, capped at the top).
No history on the rung → "First time, aim for 3 × 8–15". ✓ and "Log all the same as last time" copy sets unchanged.

## The plan (`createHomePlan` in `src/lib/home-program.ts`)
One tap from the "Set up your home plan" card after one question, push-ups in a row: 0 → Wall, 1–5 → Incline, 6–15 →
Knee, 16+ → Push-up. **Every other ladder starts at rung 2.** Three types, 3 sets each, target = the bottom of the range:
| Type | Subtitle (on the card) | Slots |
|---|---|---|
| Day A | push and squat | push_up, squat, hinge, plank, finisher (Jumping jacks) |
| Day B | pull and hinge | row, lunge, hinge one rung above Day A's (else the same), side_plank, core |
| Day C | shoulders, legs and conditioning | pike, lunge on the step-up branch (one rung above Day B's), wall_sit, calves, core, finisher (High knees) |
Idempotent: a user with a Day A keeps what they have. Rotation follows `days_per_week` by the ISO week (3 → A B C,
4 → A B C A, 5 → A B C A B): `getDayState` counts sessions with sets earlier this week and picks the pattern's next
entry, only when the active types are exactly Day A, B, C (`isHomePlan`). Estimated minutes = 2 per bodyweight set + 10
for a finisher, regardless of `session_minutes`. Rest-day card for home users: "A brisk 20–30 minute walk"; the steps
target stays.

## The finisher (`src/app/(app)/train/finisher.tsx`)
A conditioning exercise as the type's last row: 10 minutes of 30 s on / 30 s off with a visual countdown, round counter,
a vibration at each change where the phone supports it, no audio. Completing it (or "Did it without the timer, mark done")
calls `logFinisher`: one set row (so the exercise counts as logged and ✓ All same works) and a cardio entry
(`sport`, "<name>, 30/30 intervals", 10 min, hard) that Trends and the weekly report count.

## Train and Settings for bodyweight
Set rows show reps only, or seconds for holds, prefilled from last time; the hint line turns accent when a rung is earned.
Settings → Workout types shows "rung n of m" with up / down for ladder exercises (`setRoutineRung`; no-op at the ends or
when the target rung is already in the type) and "10 min" for a finisher. "Add an exercise" (Train and Settings) filters
by the user's equipment plus none by default, with "Show all"; ladder siblings sort together, easiest first, labelled
"push up rung 3".

## Bot
Day A / Day B / Day C work as type names; `done` logs the same as last time. The type reply uses each row's hint; the
morning brief prints "Knee push-up: 3 × 12/12/11 last time, aim for 13s" for bodyweight rows (loaders `typeTopSets`).

## Editing the ladders
Change `LADDERS` / `CONDITIONING` in `src/lib/library.ts` and run `pnpm seed` (idempotent by name). Inserting a rung
in the middle means renumbering `ladderLevel` for the rungs after it; existing users' routine rows keep pointing at the
exercise ids they had, so nobody is moved. Renaming a rung creates a new row (the upsert key is the name): archive
instead, or keep names stable. Ranges live in `BW_RANGE` (`src/lib/routine.ts`).

## Files
| File | Role |
|---|---|
| `src/lib/library.ts`, `src/lib/library-seed.ts`, `scripts/seed.ts` | Ladders, conditioning, gym rows with pattern/equipment; the idempotent upsert; the script |
| `src/lib/metrics/strength.ts` | `bodyweightHint`, `loadRecentSessionSets`, `bodyweightProgress`, `isBodyweight`, `RungInfo` |
| `src/lib/training.ts` | `loadLadders`, `rungInfo`, `advanceLadders`, `setRoutineRung`, `logFinisher`, the bodyweight fields on `ExerciseCard` / `ExerciseLite` |
| `src/lib/home-program.ts` | `createHomePlan`, `HOME_PLAN`, the push-up answers, `trainedThisWeek`, `FINISHER_MINUTES` |
| `src/lib/routine.ts` | `HOME_DAYS`, `isHomePlan`, `weeklyPattern`, `homeNextName`, `BW_RANGE` |
| `src/lib/rules/dayState.ts`, `src/lib/workout-card.ts` | Weekly next-up; minutes, subtitle and rest suggestion on the card |
| `src/components/workout-card.tsx`, `src/app/(app)/day-actions.ts` | The push-up question and `createHomePlanAction` |
| `src/app/(app)/train/session-view.tsx`, `finisher.tsx`, `train/actions.ts` | Reps/seconds rows, the timer, `logFinisher`, equipment filter (`fitsEquipment`) |
| `src/app/(app)/settings/workout-types-editor.tsx`, `settings/actions.ts` | Rung controls, `setRoutineRung` |
| `src/app/(app)/trends/lifts-section.tsx` | The bodyweight rung / best-set table |
| `drizzle/0010_home_program.sql` | Columns, enums, the e1RM view without bodyweight rows |
