# Changelog

User-visible changes, newest first. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), with dates instead of versions.
Add entries under **Unreleased** as you go, then turn it into a dated heading when deploying.
Skip pure refactors and internal-only changes unless they change behaviour.

## Unreleased

### Added
- **Cardio log:** incline walk, walk, run, cycle, cross-trainer, swim, stairs and sport, each showing only its fields
  (speed, distance, incline, name), plus effort and a note. Speed ⇄ distance are derived, and pace is shown for walks/runs.
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

### Changed
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

### Changed
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
