# Recomp — personal fitness tracker

## What this is
Single-user web app + Telegram bot for a 1-year body recomposition (Oct 2026 → Oct 2027).
The owner logs 4 numbers a day (weight, steps, calories, protein), lifts on training days,
and a waist measurement weekly. Everything else is derived.

Design principle: minimise daily tracking time. Every feature must reduce friction or it
doesn't ship. Most days the owner should not need to open the app at all — Telegram logging
covers it.

## Stack (do not deviate without asking)
- Next.js (App Router, TypeScript, Tailwind), `src/` layout, PWA (manifest + icons, installable on Android)
- Postgres on Neon via `@neondatabase/serverless`; Drizzle ORM; migrations with drizzle-kit
- Auth.js (next-auth v5) Google provider, allowlisted to `ALLOWED_EMAIL`; everything under `src/app/(app)` requires a session
- Telegram bot: grammY, webhook mode at `/api/telegram`; proactive sends happen from `/api/tick`
- Scheduler: `GET /api/tick`, secured by `x-tick-secret` header == `TICK_SECRET`; pinged every 15 min by cron-job.org.
  Vercel Hobby cron is daily-only — NEVER add `crons` to vercel.json.
- AI parsing: Gemini via `@google/genai`, a flash-lite class model, JSON-schema structured output.
  Always degrade gracefully if the call fails or is rate-limited (free tier, low RPM).
- Hosting: Vercel Hobby. Timezone for all rules: `Asia/Kolkata` (store UTC, compute in IST).

## Conventions
- pnpm; strict TypeScript; zod for all input validation (forms, bot messages, API bodies)
- Server Actions for app mutations; route handlers only for `/api/telegram` and `/api/tick`
- ONE shared module `src/lib/rules/` computes "state of today" (remaining kcal/protein, missing logs, verdicts).
  Both the UI chips and the bot read from it. Never duplicate that logic.
- Derived metrics live in `src/lib/metrics/`: `rolling7dAvg`, `weeklyRate`, `e1rm` (Epley), `adherence`,
  `stallDetector`, `weeklyVerdict`, `estimateMaintenance`
- Mobile-first, large tap targets; the Today screen must be usable one-handed
- Minimal dependencies. No UI kits — Tailwind only. No charting library; write a small SVG line-chart component.
- Commit after each build step with a clear message.

## Owner profile & targets (seed into `settings`)
- Goal: recomp — lose belly fat, build a V-taper back. Navel 90 cm → 76–78 cm by 2027-10-11.
- Starting: waist 86 cm, navel 90 cm, est. body fat 22–25%. Weight/height/age/sex collected in onboarding.
- Calories: target 1,925 kcal/day (range 1,900–1,950) — mild deficit.
- Protein phases (auto by date, overridable in settings):
  - `veg` until 2026-11-30: 85–100 g/day, budget ₹4,800/month
  - `nonveg` from 2026-12-01: 115–130 g/day, budget ₹5,000/month
- Steps: 8,000–10,000 target on rest days.
- Training: Upper/Lower 4-day — Mon Upper A, Tue Lower A, Thu Upper B, Fri Lower B. Wed/Sat/Sun rest.
- Post-workout cardio: 15–20 min incline walk (checkbox per session).
- Smoke-free since 2026-09-27 (approx; editable).
- Checkpoints: 2026-12-10 gym-renewal decision (8-week review card); 2027-10-11 end goal.
- Adaptive targets: once ≥21 days of weight + intake data exist, estimate true maintenance
  (`avg intake + (weekly weight change kg × 7700) / 7`) and SUGGEST a target change. Never auto-apply.
- Safety rule: if 7-day avg weight is falling faster than 0.5 %/week → verdict "eat slightly more"
  (muscle-loss risk in recomp). If flat for 3+ weeks with waist flat → "eat slightly less".

## Data model (Drizzle, Postgres)
- `settings` (id=1): targets, phase_override, timezone, telegram_chat_id, smoke_free_since, onboarding stats, nudge toggles, quiet hours
- `foods`: id, name, serving_label, serving_grams, kcal, protein_g, cost_inr, phase_tag (veg|nonveg|both), is_favourite, archived
- `food_log`: id, date, time, food_id (nullable), label, qty, kcal, protein_g, cost_inr, source (app|telegram|ai)
- `daily_metrics`: date (PK), weight_kg, steps, water_glasses (nullable), notes
- `measurements`: id, date, navel_cm, waist_cm, notes
- `exercises`: id, name, muscle_group, cues (text, nullable), is_custom
- `routine_days`: id, name (UpperA|LowerA|UpperB|LowerB), weekday, sort_order
- `routine_exercises`: routine_day_id, exercise_id, sort_order, target_sets, target_reps
- `sessions`: id, date, routine_day_id (nullable for ad-hoc), incline_walk (bool), notes
- `sets`: id, session_id, exercise_id, set_no, weight_kg, reps, rpe (nullable), is_working
- `activities`: id, date, name, minutes, notes — quick-add sport/cardio
- `nudge_log`: id, sent_at, rule_key, date, payload — prevents duplicate sends, enforces daily cap
- Views: `v_daily_totals`, `v_weight_7d`, `v_e1rm_by_exercise`, `v_weekly_summary`

## Seed data
Foods (veg; approximate — owner edits in-app):
| name | serving | kcal | protein g | ₹ |
|---|---|---|---|---|
| Whey (MB Biozyme) | 1 scoop (33 g) | 120 | 25 | 75 |
| Soya chunks | 50 g dry | 170 | 26 | 10 |
| Paneer | 100 g | 265 | 18 | 40 |
| Curd (dahi) | 200 g | 120 | 8 | 15 |
| Toned milk | 250 ml | 145 | 8 | 15 |
| Dal (cooked) | 1 cup (50 g raw) | 170 | 12 | 8 |
| Roti | 1 (30 g atta) | 100 | 3 | 3 |
| Rice | 50 g raw | 175 | 3.5 | 3 |
| Banana | 1 | 105 | 1 | 5 |
| Cooking oil | 1 tsp | 45 | 0 | 1 |
| Black coffee | 1 cup | 5 | 0 | 2 |

Foods (nonveg; phase_tag = nonveg):
| Whole egg | 1 | 75 | 6 | 7 |
| Chicken breast | 100 g raw | 120 | 23 | 30 |
| Fish (rohu) | 100 g raw | 100 | 17 | 25 |

Routine (working sets only; each session pre-fills from the last session of that routine day):
- Upper A: Lat pulldown (wide), Barbell row, Flat bench press, Overhead press, Face pull, Biceps curl
- Lower A: Back squat, Romanian deadlift, Leg press, Leg curl, Standing calf raise, Hanging knee raise
- Upper B: Pull-up (or assisted), Chest-supported row, Incline DB press, Lateral raise, Straight-arm pulldown, Triceps pushdown
- Lower B: Trap bar / conventional deadlift, Hack squat (or front squat), Walking lunge, Leg extension, Seated calf raise, Cable crunch

Lat cues — attach to every pull exercise (pulldown, rows, pull-ups, straight-arm pulldown):
1. Thumbless grip — reduces forearm/biceps takeover
2. Depress scapulae first — shoulders down into back pockets, before the pull
3. Drive elbows down and back toward the hips; don't pull with the hands
Note shown with cues: upper-trap or forearm pain during pulls = shrugging + biceps dominance.

## Screens
1. **Onboarding** (first run only): weight, height, age, sex → settings; confirm targets; link Telegram (show `/start <code>`)
2. **Today**: date header · 4 big inputs (weight, steps; kcal and protein auto-summed) · meals list with tap-to-add favourites,
   qty stepper, and quick add (label + kcal + protein) · "remaining" chips from the rules module · smoke-free counter
3. **Train**: today's routine day pre-filled with last session's weight × reps per exercise; edit only what changed ·
   "+ exercise" quick add (pick existing or type new) · "+ activity" (name + minutes) · incline-walk checkbox ·
   stall badge when e1RM flat for ≥3 sessions · lat cues visible on pull exercises
4. **Trends**: weight (daily + 7-day avg) · navel/waist vs straight goal line to 2027-10-11 · weekly protein hit-rate
   and kcal adherence · e1RM per lift · protein spend vs budget (month) · Dec 10 checkpoint card · CSV export of every table
5. **Settings**: targets, phase override, foods editor, routine editor, nudge toggles + quiet hours, Telegram link, smoke-free date

## Telegram bot
Exact-match commands (no AI):
- `w 74.2` weight · `s 8500` steps · `<food> <qty>` e.g. `paneer 150`, `roti 3`, `scoop` (qty defaults to 1 serving)
- `water` (+1 glass; optional feature) · `done` (mark today's workout done; reply with app link to enter sets)
- `today` (state summary from rules module) · `undo` (remove last log entry)
Free text (AI): anything else → Gemini parses against the foods list → returns matched items, estimated unknowns, totals.
Bot replies with the summary + inline ✓ / Edit buttons. Write to DB only on ✓.
If Gemini fails or is rate-limited → reply: "couldn't parse that — try `paneer 150` style".
Only `settings.telegram_chat_id` is accepted; ignore every other chat silently.

## Rules engine (`src/lib/rules`) — evaluated on every `/api/tick`, in IST
Each rule = `{ key, window, condition(state), message(state) }`. Idempotent via `nudge_log`
(one send per key per day). Daily cap 6 messages. Quiet hours 22:30–07:00.
- `morning_brief` 07:30–08:30: today's routine day + last session top sets; add "weigh in" if no weight yet
- `lunch_check` 13:30–14:30: nothing logged since 11:00
- `protein_check` 16:30–17:30: protein < 45 % of target → grams remaining + cheapest fix from foods (rank by ₹ per g protein)
- `kcal_check` 20:00–20:45: remaining kcal before dinner, or amount over target
- `day_close` 22:00–22:30: summary + anything missing (weight, steps, workout on a training day) with inline buttons to log
- `water` 10:00–20:00 every 2 h: reminder only; OFF by default, toggle in settings
- `weekly_measure` Sun 19:00: prompt navel/waist; once logged send the weekly report
  (7-day avg Δ, navel Δ, lifts progressed, adherence %, verdict)
- `budget_80`: month-to-date protein spend ≥ 80 % of budget before the 24th
- `phase_switch` 2026-12-01 · `checkpoint_card` 2026-12-10 · `smokefree_milestone` weekly
- Instant (on the logging path, not the tick): a log that pushes kcal over target → immediate reply with the overage

## Env (`.env.example`)
`DATABASE_URL` `AUTH_SECRET` `AUTH_GOOGLE_ID` `AUTH_GOOGLE_SECRET` `ALLOWED_EMAIL`
`TELEGRAM_BOT_TOKEN` `TELEGRAM_BOT_USERNAME` `TELEGRAM_WEBHOOK_SECRET` `TICK_SECRET` `GEMINI_API_KEY` `NEXT_PUBLIC_APP_URL`

## Build order
1 scaffold → 2 schema + seed → 3 auth + app shell + PWA → 4 Today → 5 Train → 6 Trends + export
→ 7 Telegram bot + Gemini → 8 rules engine + tick → 9 deploy, set webhook, cron-job.org

## Non-goals (don't build unless asked)
Food-database search, calorie-burn estimates, sleep tracking, mood, multi-user, social features, native app.

## Environment notes
- Next 16.4, React 19.3, TypeScript strict, pnpm.
- Tailwind v4: CSS-first config (`@import "tailwindcss"` + `@theme` in `src/app/globals.css`). There is no `tailwind.config` file — don't create one.
- Turbopack is always on in Next 16 (dev and build); there is no webpack fallback.
- `AGENTS.md` is auto-generated and rewritten by `next dev` on every run — never edit it. CLAUDE.md is the source of truth.
- Run `pnpm exec next typegen` before `tsc --noEmit`; the generated `LayoutProps` / `PageProps` globals live in `.next/types` and `tsc` fails without them.
- `cacheComponents` is OFF in next.config.ts: every screen is per-request (auth + db), and the flag would require a Suspense boundary around each dynamic read. Keep it off.
- Request-level guards use `proxy.ts` in Next 16 (`middleware.ts` is deprecated). The auth gate lives in `src/app/(app)/layout.tsx`; there is no proxy.ts.
- Root `auth.ts` is importable as `@/auth` via an explicit tsconfig path alias.

## Secrets
- Secrets live in `.env` (not `.env.local`). All scripts, `drizzle.config.ts`, and Next.js read from `.env`.
  Next.js and drizzle-kit both load `.env` automatically; standalone scripts must load it explicitly (e.g. `node --env-file=.env`).
- Never print, cat, echo, log, or quote the contents of `.env` or any environment variable value — not in terminal
  output, commit messages, code comments, error messages, or summaries. To confirm a variable exists, report only
  its name and whether it is set (e.g. `DATABASE_URL: set`), never the value.
