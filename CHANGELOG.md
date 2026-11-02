# Changelog

User-visible changes, newest first. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), with dates instead of versions.
Add entries under **Unreleased** as you go, then turn it into a dated heading when deploying.
Skip pure refactors and internal-only changes unless they change behaviour.

## Unreleased

### Added
- **Home program.** Home users build Day A / B / C from the workout card after one question (push-ups in a row). Eleven
  bodyweight ladders with a cue per rung (wall push-up to archer push-up, table rows, squats to a doorframe pistol,
  hinges, lunges, planks, side planks, core holds, wall sits, calves) and seven finishers. Progression by reps: all sets
  at the top of 8–15 (20–45 s for holds) moves the exercise up a rung on the next Start; two sessions under the bottom
  suggest the rung below; three flat sessions suggest a slower lowering or an extra set. Train shows reps or seconds
  only for bodyweight rows, a 10-minute 30 s on / 30 s off finisher timer (vibration, no audio) that logs a cardio entry,
  and "rung n of m" with up / down in Settings → Workout types. "Add an exercise" filters by your equipment. Rotation
  is the same as for every type: the one after the last one trained. Trends → Lifts lists bodyweight rungs and best
  sets. The bot accepts `day a` / `day b` / `day c` and the morning brief prints the bodyweight hints. "Create my plan"
  seeds the exercise library itself when a ladder is missing, so `pnpm seed` is only needed for changed cues or new rungs.
  Starting rungs: holds and calves start at rung 1; push-ups and the rest follow the push-up answer (0 → everything at 1;
  1–5 → push-ups at 2; 6–15 → push-ups at 3, rows at 1, the rest at 2; 16+ → push-ups at 4, the rest at 2).
- **Today's workout card** at the top of Today and Train: the next type in rotation with its icon, exercise count,
  estimated minutes (your session length, or sets × 2.5 min), when it was last done and the last top set of its first
  two lifts, one Start button, and "Something else" for the full picker. Once started it shows "Pull, 3 of 6 done".
  Rest days show the step target with today's count and a suggestion from your cardio log ("20-minute walk, like last
  Wednesday"). Home users without workout types see "Set up your home plan", and Settings → Workout types explains that
  bodyweight plans arrive in the next release. The morning brief adds the estimated minutes.
- **Settings → Diagnostics** (every user; admins get more) and `diag` in Telegram: build, env present/missing by name,
  database check and migration, webhook status, last tick run per user, Gemini status, each account's link state and last
  bot activity (admin); your account, session age, Telegram link (chat id masked), row counts, today's DayState as the
  chips and the bot read it, phone time vs IST, PWA / service worker state, recent events and client errors. **Copy
  diagnostics** puts it all on the clipboard as plain text with no secrets; admins can **Run tick (dry)** inline. Events
  (`diag_events`, migration 0009) are written by the bot, the tick, Gemini and server-action errors and kept 7 days.
  Each section loads on its own: a failing one shows its error class, the rest still render, and the copied text lists
  the failures under "Errors". Copy sits in the card heading and always works. System opens with "N migrations pending
  — run pnpm db:migrate" when the database is behind the code.
- **Multi-user.** Anyone in `ALLOWED_EMAILS` (first entry = the owner/admin) gets their own account on sign-in, with their own
  data, targets, foods, workout types and Telegram link; nothing is shared between people except the exercise library.
  Onboarding now asks for a goal (recomp / fat loss / muscle gain), gym or home (+ equipment), days per week and minutes per
  session, and derives calorie and protein targets from them. Gym users start with Push/Pull/Legs; home users start with an
  empty workout-type list. Verdicts and the maintenance suggestion follow the goal (fat loss: > 1 %/week → eat more, flat 2
  weeks → eat less). One bot for everyone: `/start <code>` links a chat to its owner; reminders run per user with each
  person's own cap. Export is per user. Settings → People (admin only) lists accounts, onboarding and link status.
- `pnpm test`: migrations + two-user isolation test on an in-memory Postgres (PGlite), plus the allowlist / blocked-chat test.
- `pnpm backup` / `pnpm backup --full`: dated JSON of every table into `backups/` (gitignored); chat ids and link codes
  are nulled unless `--full`. With the Neon branch, this is the restore source; the per-user CSV export stays for users.
- **Cardio log:** incline walk, walk, run, cycle, cross-trainer, swim, stairs and sport, each showing only its fields
  (speed, distance, incline, name), plus effort and a note. Every field but minutes is optional (`walk 30` is fine);
  give speed or distance and the other is derived, and pace is shown for walks/runs.
  Train has a Cardio section with one-tap "Same as last time"; Today has a cardio line. Replaces "+ Activity".
- Bot cardio: `incline 20 4.5 6%`, `walk 30 5`, `run 25 4.2km hard`, `sport badminton 45`, `cardio` to repeat. `undo` now removes
  the newest food or cardio entry; `today` shows cardio; day close offers "＋ <last cardio>"; the weekly report shows cardio minutes vs last week.
- Trends → More details → Cardio: minutes per week (8 weeks) and a conditioning chart (speed per entry, incline labels, effort colours).
- **Choose your day:** a "What's today?" picker on Today and Train (a button per workout type with days since it was last done,
  next up highlighted, plus Rest; Custom and archived types under ⋯). Replaces the fixed weekday schedule.
- Workout types **Push / Pull / Legs** in a rotation that suggests "next up" (data script `pnpm choose-day` archives Upper/Lower
  and turns past "No training today" taps into rest days).
- Bot: send a workout type name (`push`, `pull`, `legs`) or `rest` to set the day. Morning brief shows "Next up: Pull (last
  done 4 days ago)" with buttons; day close asks "What did you do today?" with one-tap log buttons.
- Settings → **Workout types**: add, rename, reorder (= rotation), archive/restore, exercises per type, sessions-per-week target.
- Train "+ Add an exercise" searches the full library, with "Also add to <type>".
- **Sets per muscle** (working sets per muscle group, last 4 weeks, back first) in Trends → More details and the weekly report.
- Project documentation in `docs/` (product, architecture, data model, one doc per feature, rules engine, operations) and this changelog.
- `/sync-docs` project skill (`.claude/skills/sync-docs`): maps a diff to the docs it affects, updates them and the changelog.

### Security
- `ALLOWED_EMAILS` is the only authority: a `users` row no longer grants access, and the list is re-checked on every
  request, so removing someone from the env and redeploying locks them out of the app immediately (their bot access ends
  when `remove-user` runs). The first entry still claims the placeholder owner.
- Next.js 16.4.0 → 16.4.4 (and `eslint-config-next`): fixes an unauthenticated RCE in the image optimizer with SVG files,
  an RCE in `use cache` functions returning typed arrays, and a Server Actions denial of service.

### Fixed
- One failed Telegram send (429, or a 403 from someone who blocked the bot) no longer aborts `/api/tick` for the users
  after them: each user's run is isolated and reported as `ok` or the error class. A 403 marks that chat blocked
  (Settings → People shows it); reminders pause until they write to the bot again.

### Changed
- Transitions are back on things that answer a tap (switches, chevrons, bar fills, card collapse), 150 ms, honouring
  reduced motion; the completion tick stays the only unprompted animation.
- **Look and feel.** One typeface (Manrope) with tabular figures; a light, high-contrast palette with one accent (blue)
  for today's next action and progress and a separate muted green for anything done; dark mode follows the system.
  Numbers lead every screen: kcal left and protein to go on Today, "3 of 6 logged" on Train, the 7-day average on
  Trends. Fewer boxes, no shadows; lucide icons for the tabs, muscle groups, veg / non-veg, steps, weigh-in, meals, checks
  and the streak. Sentence-case copy throughout, every empty state says what to do next, every error says how to fix it,
  and progression hints read "Last 60 × 8/8/8, try 62.5 next". The only animation is the tick when a workout or the
  protein target is completed, and it respects reduced motion.
- README rewritten as a from-zero setup guide (Neon, Google OAuth, BotFather, Gemini, Vercel env, cron-job.org), with
  scripts, adding/removing a person, privacy, security model, costs and troubleshooting. New docs: `users.md`,
  `testing.md`, `troubleshooting.md`; `operations.md` covers the migration deploy order, webhook rotation and backups.
- `pnpm remove-user:dry <email>` / `pnpm remove-user <email>`: delete a person and everything they own (refuses admins).
- Owner-only settings (protein phases, budgets, navel goal, checkpoint dates, smoke-free date) are optional: Trends hides
  "Navel vs goal", the goal card, the spend section and the checkpoint card when they are unset, and the Protein phase card
  only shows for users with phases. The checkpoint card is titled by its date instead of "Dec 10".
- `pnpm seed` now seeds only the exercise library (foods and workout types are per user).
- The incline-walk checkbox is gone from the workout; old ticks still count as a cardio session (no minutes).
- Session adherence, the weekly report and the Dec 10 checkpoint measure sessions against the weekly target (default 4)
  instead of the fixed weekday plan.
- `done` logs the chosen workout type; with no day chosen it asks which.
- `CLAUDE.md` slimmed to rules + a docs map; the detailed spec moved to `docs/`.

### Fixed
- `pnpm seed` crashed since 2026-10-11 (`server-only` in the db module throws under plain Node); db scripts now run with `--conditions=react-server`.

## 2026-10-17: Simplification

### Added
- **My meals:** "Save to My meals" on manual entries makes any meal a one-tap chip (stored as a `foods` row with the serving "1 meal").
- **Same as yesterday:** copies yesterday's food log onto an empty day (app button; bot `copy` / `same`).
- Bot `dosa 350 12`: a manual meal with your own kcal + protein.
- Train **✓ same as last time** per exercise and **✓ All same as last time** for the whole session.

### Security
- Next.js 16.4.0 → 16.4.4 (and `eslint-config-next`): fixes an unauthenticated RCE in the image optimizer with SVG files,
  an RCE in `use cache` functions returning typed arrays, and a Server Actions denial of service.

### Changed
- README rewritten as a from-zero setup guide (Neon, Google OAuth, BotFather, Gemini, Vercel env, cron-job.org), with
  scripts, adding/removing a person, privacy, security model, costs and troubleshooting. New docs: `users.md`,
  `testing.md`, `troubleshooting.md`; `operations.md` covers the migration deploy order, webhook rotation and backups.
- `pnpm remove-user:dry <email>` / `pnpm remove-user <email>`: delete a person and everything they own (refuses admins).
- Owner-only settings (protein phases, budgets, navel goal, checkpoint dates, smoke-free date) are optional: Trends hides
  "Navel vs goal", the goal card, the spend section and the checkpoint card when they are unset, and the Protein phase card
  only shows for users with phases. The checkpoint card is titled by its date instead of "Dec 10".
- `pnpm seed` now seeds only the exercise library (foods and workout types are per user).
- The incline-walk checkbox is gone from the workout; old ticks still count as a cardio session (no minutes).
- Today: manual entry (name, kcal, protein) is always open; chips merged into the progress card's status line;
  ₹ removed from logging; meal rows use tap → −/+/Delete instead of long-press.
- Train: one line per exercise with last session + progression hint; the set grid only opens on tap; notes/discard behind ⋯;
  other routine days / free workout behind one link; activities no longer ask for a note.
- **Start no longer pre-copies last session's sets.** An exercise counts only after ✓ or typed sets.
- Bot `done` and the day-close "✓ Did it" button log the workout as same as last time.
- Trends: verdict, weight, navel vs goal and the measurement log on top; checkpoint (around Dec 10) and maintenance
  (when ≥ 50 kcal off) promoted only when relevant; everything else under "More details".
- Reminders: lunch / protein / calorie / budget checks off by default; daily cap 6 → 4 (migration `0004` also updates the existing settings).
- Settings: Everyday (targets, phase, Telegram, reminders) first; foods, routine, body & habits, export collapsed under Setup.

## 2026-10-11: Initial build
- Scaffold, schema + views + seed, Google auth + PWA shell, onboarding.
- Today screen, Train screen, Trends (weight, measurements, adherence, verdict, lifts, spend, checkpoint, goal, CSV export).
- Telegram bot with exact-match commands and Gemini free-text parsing.
- Rules engine + `/api/tick` scheduler.
- Settings editors (targets, phase, foods, routine, nudges, Telegram link).
- Fix: keep the db module out of the client bundle.
