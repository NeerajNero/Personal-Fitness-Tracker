# Changelog

User-visible changes, newest first. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), with dates instead of versions.
Add entries under **Unreleased** as you go, then turn it into a dated heading when deploying.
Skip pure refactors and internal-only changes unless they change behaviour.

## Unreleased

### Added
- Project documentation in `docs/` (product, architecture, data model, one doc per feature, rules engine, operations) and this changelog.
- `/sync-docs` project skill (`.claude/skills/sync-docs`): maps a diff to the docs it affects, updates them and the changelog.

### Changed
- `CLAUDE.md` slimmed to rules + a docs map; the detailed spec moved to `docs/`.

### Fixed
- The Milestones reminder no longer claims to send smoke-free weekly milestones (that rule was never built).

## 2026-10-17: Simplification

### Added
- **My meals:** "Save to My meals" on manual entries makes any meal a one-tap chip (stored as a `foods` row with the serving "1 meal").
- **Same as yesterday:** copies yesterday's food log onto an empty day (app button; bot `copy` / `same`).
- Bot `dosa 350 12`: a manual meal with your own kcal + protein.
- Train **✓ same as last time** per exercise and **✓ All same as last time** for the whole session.

### Changed
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
