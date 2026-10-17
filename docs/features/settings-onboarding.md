# Settings (`/settings`), onboarding, auth

## Sign-in & gate
- `/login` → Google via Auth.js. Only `ALLOWED_EMAIL` is accepted, and an unset value rejects everyone.
- `src/app/(app)/layout.tsx` redirects to `/login` without a session and to `/onboarding` until `settings.onboarded_at` is set.
- Server Actions call `requireSession()` themselves. The export route checks `auth()`.

## Onboarding (`/onboarding` → `/onboarding/confirm`)
Weight, height, age, sex → saved to `settings` → confirm targets → link Telegram by sending `/start <code>` to the bot
(`settings.telegram_link_code`). The bot stores the chat id on the first matching `/start` and ignores every other chat.

## Settings layout
**Everyday**
- **Targets**: kcal target/range, protein per phase, steps, budgets (`targets-form.tsx`)
- **Protein phase**: auto by date, or an override (`phase-section.tsx`)
- **Telegram**: link status / code (`telegram-card.tsx`)
- **Telegram reminders**: 4 main toggles. "More reminders, quiet hours, daily cap" folds the rest (`nudge-settings.tsx`)

**Setup: rarely changed** (all collapsed)
- **Foods & My meals**: edit, favourite ★, archive (`foods-editor.tsx`). Saved meals show here with the serving "1 meal".
- **Workout types** (`workout-types-editor.tsx`): sessions-per-week target · each active type (▲▼ = rotation order, Rename,
  Archive; expand for its exercises: order, sets × reps, cues, + Exercise) · Add type · Archived list with Restore.
  Names are bot commands: a reserved bot word (`BOT_COMMAND_WORDS`) or a duplicate is refused; a food with the same name only warns.
- **Body & habits**: onboarding stats + smoke-free date (`body-stats-form.tsx`)
- **Export data**: one CSV per table (`/api/export/<table>`). `settings` is never exported because it holds the chat id.

All mutations are in `src/app/(app)/settings/actions.ts`. Shared UI bits (Card with `collapsible`, Field, Status) are in `settings/ui.tsx`.
