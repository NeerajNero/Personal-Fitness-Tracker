# Rules engine & "state of today"

Read this when changing reminders, the `/api/tick` scheduler, anything that reads "what's left today",
or the instant over-target reply.

## `getDayState(date, { settings? })` (`src/lib/rules/dayState.ts`)
The **only** place that computes the state of a day. The Today card, the bot's `today` command and every nudge read it.
```
DayState {
  date: "YYYY-MM-DD"                      // IST
  targets: { phase, kcal, kcalRange, proteinMin, proteinMax, steps, stepsRange, budget }  // getTargets() in metrics/phase.ts
  totals:    { kcal, protein, cost, entries }
  remaining: { kcal, protein }            // negative = over; protein measured against proteinMin
  metrics:   { weightKg, steps, waterGlasses }   // null when not logged
  flags: { weightLogged, stepsLogged, isTrainingDay, routineDayName, routineDayId,
           workoutLogged,       // ≥1 set or incline walk. Starting a session alone does NOT count
           sessionId,           // any session row today
           trainingSkipped,     // nudge_log marker `mark:no_training`
           lastFoodAt, foodLoggedSince(time) }
  smokeFreeDays: number | null
}
```
- `foodLoggedSince` is a function. Pick the plain fields before passing DayState to a client component.
- Six queries run in parallel. Pass `settings` when the caller already has it.

## Engine (`engine.ts` + `rules.ts`)
- `GET /api/tick` (cron-job.org every 15 min, header `x-tick-secret`) → `evaluate(now)` → `send(due)`.
- A rule is `{ key, window, days?, once?, enabled(settings), condition(ctx), message(ctx), logKey? }`.
- Skip reasons: `disabled`, `quiet_hours`, `outside_window`, `already_sent`, `daily_cap`, `condition_false`, `not_linked`.
- Idempotency: one `nudge_log` row per rule_key per IST date. Water logs `water_HH`, the weekly report logs `weekly_report_<monday>`,
  `budget_80` fires once a month, and `phase_switch` / `checkpoint_card` fire once ever.
- Daily cap (default **4**) and quiet hours (22:30–07:00) come from settings. `mark:*` rows don't count toward the cap.
- `ctx.load` (`loaders.ts`) holds lazy, memoised metric loaders, so a rule only pays for the data it reads.
- Debug: `pnpm tick:dry` evaluates without sending. `pnpm tick force=day_close` sends one rule now (still logged).

## Rules (all times IST)
| key | when | default | condition / content |
|---|---|---|---|
| `morning_brief` | 07:30–08:30 | **on** | today's routine day + last top sets; "weigh in" if no weight yet |
| `day_close` | 22:00–22:30 | **on** | summary + what's missing; buttons "✓ Did it (same as last time)" (→ `copyLastSets`) / "No training today" (→ `mark:no_training`) |
| `weekly_measure` | Sun 19:00–22:30 | **on** | prompt navel/waist if none logged this week |
| `weekly_report` | Sun 19:00–22:30 | **on** | once a measurement exists: 7-day avg Δ, navel Δ, lifts progressed, adherence, verdict |
| `weekly_report_mon` | Mon 08:00–09:00 | **on** | fallback report with "no measurement this week" |
| `phase_switch` | on `phase_switch_date` | **on** (milestones) | once ever, skipped if a phase override is set |
| `checkpoint_card` | on `checkpoint_date` | **on** (milestones) | once ever; 8-week summary |
| `lunch_check` | 13:30–14:30 | off | nothing logged since 11:00 |
| `protein_check` | 16:30–17:30 | off | protein < 45 % of target → grams left + cheapest fix (₹ per g protein) |
| `kcal_check` | 20:00–20:45 | off | kcal left before dinner / amount over |
| `water` | 10:00–20:30, every 2 h | off | reminder only |
| `budget_80` | 09:00–21:00, before the 24th | off | month-to-date protein spend ≥ 80 % of budget |

Not built: a weekly smoke-free milestone (it's in the original spec, but no rule exists).

## Instant rule (logging path, not the tick)
`overageLine(state)` in `instant.ts`: any bot log that pushes kcal over target gets the overage appended to the reply
(`withOverage` in `telegram/messages.ts`).

## Adding a rule
1. Add the toggle column to `settings` + a migration, and add it to `NUDGE_TOGGLES` in `src/lib/nudges.ts`.
2. Add the rule object to `RULES` in `rules.ts`. Read state from `ctx.state` and `ctx.load`, and never query directly.
3. Add a row to `MAIN` or `EXTRA` in `src/app/(app)/settings/nudge-settings.tsx`.
4. Check it with `pnpm tick:dry` and `pnpm tick force=<key>`, then update the table above.
