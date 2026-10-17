# Product: goal, targets, principles

Read this when a change touches targets, phases, verdict logic, seed data, or "should we build X?".

## Goal
1-year body recomposition, Oct 2026 → **2027-10-11**. Lose belly fat, build a V-taper back.
Navel 90 cm → 76–78 cm. Starting waist 86 cm, est. body fat 22–25 %.
Weight / height / age / sex are collected in onboarding.

## Design principles (these decide every feature)
1. **Minimise daily tracking time.** A feature has to reduce friction, or it doesn't ship.
2. **Telegram first.** On most days the owner never opens the app.
3. **Confirm by exception.** Repeat what happened last time with one tap, and type only what changed
   (My meals, "Same as yesterday", ✓ same as last session).
4. **Show the answer, hide the detail.** Every screen leads with one thing to act on. Everything else sits under "More".
5. **Photo calorie estimation stays outside the app.** The owner photographs meals, gets kcal + protein from an
   outside AI and types the numbers in (`dosa 350 12` in Telegram, or Add a meal on Today). Don't build it in.
6. **Kcal + protein only.** No fat or carbs. Cost (₹) is still stored, but it isn't asked for or shown on logging
   screens. The owner will decide on cost later.

## Targets (seeded into `settings`; editable in Settings)
| What | Value |
|---|---|
| Calories | 1,925 kcal/day (range 1,900–1,950), mild deficit |
| Protein, `veg` phase (until 2026-11-30) | 85–100 g/day, budget ₹4,800/month |
| Protein, `nonveg` phase (from 2026-12-01) | 115–130 g/day, budget ₹5,000/month |
| Steps (rest days) | 8,000–10,000 |
| Training | Upper/Lower 4-day: Mon Upper A, Tue Lower A, Thu Upper B, Fri Lower B. Wed/Sat/Sun rest |
| Cardio | 15–20 min incline walk after lifting (checkbox per session) |
| Smoke-free since | 2026-09-27 (editable) |
| Checkpoints | 2026-12-10 gym-renewal decision (8-week review) · 2027-10-11 end goal |

The phase is chosen automatically by date (`settings.phase_switch_date`) unless `phase_override` is set.
See `getTargets()` in `src/lib/metrics/phase.ts`.

## Coaching rules
- **Adaptive target:** once ≥ 21 days of weight + intake exist, estimate maintenance as
  `avg intake + (weekly weight change kg × 7700) / 7` and **suggest** a new target. Never apply it automatically.
- **Safety:** if the 7-day average weight falls faster than 0.5 %/week, the verdict is "eat slightly more"
  (muscle-loss risk in a recomp).
- **Plateau:** weight flat for 3+ weeks and navel flat → "eat slightly less".
- **Logging gate:** fewer than 5 of the last 7 days logged → "tighten logging" (the numbers can't be trusted).
- Code: `weeklyVerdictFrom` and `estimateMaintenanceFrom` in `src/lib/metrics/trends.ts`.

## Seed data (`scripts/seed.ts`)
Foods (approximate; the owner edits them in the app):

| name | serving | kcal | protein g | ₹ | phase |
|---|---|---|---|---|---|
| Whey (MB Biozyme) | 1 scoop (33 g) | 120 | 25 | 75 | veg |
| Soya chunks | 50 g dry | 170 | 26 | 10 | veg |
| Paneer | 100 g | 265 | 18 | 40 | veg |
| Curd (dahi) | 200 g | 120 | 8 | 15 | veg |
| Toned milk | 250 ml | 145 | 8 | 15 | veg |
| Dal (cooked) | 1 cup (50 g raw) | 170 | 12 | 8 | veg |
| Roti | 1 (30 g atta) | 100 | 3 | 3 | veg |
| Rice | 50 g raw | 175 | 3.5 | 3 | veg |
| Banana | 1 | 105 | 1 | 5 | veg |
| Cooking oil | 1 tsp | 45 | 0 | 1 | veg |
| Black coffee | 1 cup | 5 | 0 | 2 | veg |
| Whole egg | 1 | 75 | 6 | 7 | nonveg |
| Chicken breast | 100 g raw | 120 | 23 | 30 | nonveg |
| Fish (rohu) | 100 g raw | 100 | 17 | 25 | nonveg |

Routine (working sets only):
- **Upper A:** Lat pulldown (wide), Barbell row, Flat bench press, Overhead press, Face pull, Biceps curl
- **Lower A:** Back squat, Romanian deadlift, Leg press, Leg curl, Standing calf raise, Hanging knee raise
- **Upper B:** Pull-up (or assisted), Chest-supported row, Incline DB press, Lateral raise, Straight-arm pulldown, Triceps pushdown
- **Lower B:** Trap bar / conventional deadlift, Hack squat (or front squat), Walking lunge, Leg extension, Seated calf raise, Cable crunch

Lat cues, attached to every pull exercise (pulldown, rows, pull-ups, straight-arm pulldown):
1. Thumbless grip: reduces forearm/biceps takeover
2. Depress scapulae first: shoulders down into back pockets, before the pull
3. Drive elbows down and back toward the hips; don't pull with the hands

Note shown with the cues: upper-trap or forearm pain during pulls = shrugging + biceps dominance.

## Non-goals (don't build unless asked)
Food-database search, photo/AI calorie estimation in the app, fat/carb tracking, calorie-burn estimates, sleep, mood,
multi-user, social features, a native app.
