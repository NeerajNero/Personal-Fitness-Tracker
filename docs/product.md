# Product: goal, targets, principles

Read this when a change touches targets, phases, verdict logic, seed data, or "should we build X?".

## Goal
The app serves a few people, each with their own account, data and targets (see `## Users` in `CLAUDE.md`). Onboarding
collects weight / height / age / sex, a goal (recomp, fat loss, muscle gain), gym or home (+ equipment), days per week and
minutes per session, and derives the targets (`src/lib/targets.ts`).

The owner's own goal: 1-year body recomposition, Oct 2026 → **2027-10-11**. Lose belly fat, build a V-taper back.
Navel 90 cm → 76–78 cm. Starting waist 86 cm, est. body fat 22–25 %.

## Design principles (these decide every feature)
1. **Minimise daily tracking time.** A feature has to reduce friction, or it doesn't ship.
2. **Telegram first.** On most days the owner never opens the app.
3. **Confirm by exception.** Repeat what happened last time with one tap, and type only what changed
   (My meals, "Same as yesterday", ✓ same as last session).
4. **You choose the day.** No fixed weekday plan: pick a workout type (or Rest) each day. The app suggests the next one in rotation.
5. **Show the answer, hide the detail.** Every screen leads with one thing to act on. Everything else sits under "More".
6. **Photo calorie estimation stays outside the app.** The owner photographs meals, gets kcal + protein from an
   outside AI and types the numbers in (`dosa 350 12` in Telegram, or Add a meal on Today). Don't build it in.
7. **Kcal + protein only.** No fat or carbs. Cost (₹) is still stored, but it isn't asked for or shown on logging
   screens. The owner will decide on cost later.

## Targets per goal (computed at onboarding, editable in Settings)
Maintenance = Mifflin-St Jeor × activity factor (1.2 / 1.375 / 1.55 / 1.725 / 1.9 for 0 / 1–2 / 3–4 / 5–6 / 7 days a week).
kcal range = target ± 25. Steps 8,000–10,000 on rest days for everyone.

| Goal | Calories | Protein | Verdict rules |
|---|---|---|---|
| recomp | maintenance − 225 | 1.8–2.0 g/kg | as below (the owner's rules) |
| fat_loss | maintenance − 500, floor 1,400 kcal (female) / 1,600 (male) | 2.0–2.2 g/kg | loss > 1.0 %/week → eat more · flat ±0.2 kg for 2+ weeks → eat less · < 5 logged days → tighten logging · maintenance card suggests tdee − 500 |
| muscle_gain | maintenance + 250 | 1.8–2.0 g/kg | recomp rules for now; maintenance card suggests tdee + 250 |

Protein phases, budgets, the navel goal and the checkpoint dates are **owner-only** (null for other users, and Trends /
reminders hide what needs them). Everyone else has a single protein range (`settings.protein_min/max`).

## Owner profile (user 1 seed values)
These are the owner's stored `settings` values (kept by migration 0007; never recomputed). Owner-only values are marked.
| What | Value |
|---|---|
| Calories | 1,925 kcal/day (range 1,900–1,950), mild deficit |
| Protein, `veg` phase (until 2026-11-30) · owner-only | 85–100 g/day, budget ₹4,800/month |
| Protein, `nonveg` phase (from 2026-12-01) · owner-only | 115–130 g/day, budget ₹5,000/month |
| Steps (rest days) | 8,000–10,000 |
| Training | **Choose the day**, no weekday schedule. Workout types Push → Pull → Legs (rotation suggests "next up"); target 4 sessions/week (`settings.weekly_session_target`) |
| Cardio | 15–20 min incline walk after lifting (checkbox per session) |
| Smoke-free since · owner-only | 2026-09-27 (editable; empty for others until set) |
| Navel goal · owner-only | 90 → 76–78 cm by 2027-10-11 |
| Checkpoints · owner-only | 2026-12-10 gym-renewal decision (8-week review) · 2027-10-11 end goal |

The phase is chosen automatically by date (`settings.phase_switch_date`) unless `phase_override` is set; users without
phases see every food. See `getTargets()` in `src/lib/metrics/phase.ts`.

## Coaching rules
- **Adaptive target:** once ≥ 21 days of weight + intake exist, estimate maintenance as
  `avg intake + (weekly weight change kg × 7700) / 7` and **suggest** a new target. Never apply it automatically.
- **Safety:** if the 7-day average weight falls faster than 0.5 %/week, the verdict is "eat slightly more"
  (muscle-loss risk in a recomp).
- **Plateau:** weight flat for 3+ weeks and navel flat → "eat slightly less".
- **Logging gate:** fewer than 5 of the last 7 days logged → "tighten logging" (the numbers can't be trusted).
- Code: `weeklyVerdictFrom` and `estimateMaintenanceFrom` in `src/lib/metrics/trends.ts`.

## Seed data (`scripts/seed.ts`, `src/lib/library.ts`)
A fresh database gets only the shared exercise library. Users are created on first sign-in; gym users get Push/Pull/Legs
at onboarding, home users start with no workout types. Foods are per user and start empty (the owner's catalogue below
was seeded before multi-user):

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

Workout types (rotation order, 3 × 8 working sets each):
- **Push:** Flat bench press, Overhead press, Incline DB press, Lateral raise, Triceps pushdown
- **Pull:** Pull-up (or assisted), Lat pulldown (wide), Barbell row, Chest-supported row, Face pull, Biceps curl
- **Legs:** Back squat, Romanian deadlift, Leg press, Leg curl, Leg extension, Standing calf raise, Hanging knee raise

The exercise library also keeps Straight-arm pulldown, Hack squat (or front squat), Walking lunge, Trap bar / conventional
deadlift, Seated calf raise and Cable crunch (searchable in "+ Exercise"). Upper A/B and Lower A/B (Oct 2026) are archived types.

Lat cues, attached to every pull exercise (pulldown, rows, pull-ups, straight-arm pulldown):
1. Thumbless grip: reduces forearm/biceps takeover
2. Depress scapulae first: shoulders down into back pockets, before the pull
3. Drive elbows down and back toward the hips; don't pull with the hands

Note shown with the cues: upper-trap or forearm pain during pulls = shrugging + biceps dominance.

## Non-goals (don't build unless asked)
Food-database search, photo/AI calorie estimation in the app, fat/carb tracking, calorie-burn estimates, sleep, mood,
social features, a native app.

## Files
| File | Role |
|---|---|
| `src/lib/targets.ts` | Targets per goal (Mifflin-St Jeor, activity factor, floors) |
| `src/lib/metrics/phase.ts` | `getTargets`, `getPhase`, `foodInPhase` |
| `src/lib/metrics/trends.ts` | `weeklyVerdictFrom`, `estimateMaintenanceFrom` (goal-aware) |
| `src/lib/library.ts`, `scripts/seed.ts` | Exercise library, gym starter types |
| `drizzle/0007_multi_user.sql` | Where the owner's values were preserved |
