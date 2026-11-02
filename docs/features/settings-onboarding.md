# Settings (`/settings`), onboarding, auth

## Sign-in & gate
- `/login` → Google via Auth.js. Accepted: an email in `ALLOWED_EMAILS` (comma-separated, case-insensitive; the older
  `ALLOWED_EMAIL` still works) or one that already has a `users` row. Unset = everyone rejected. The first allowed sign-in
  creates the users row (`ensureUser`); the **first list entry claims the placeholder owner** created by migration 0007 and is admin.
- The user id travels in the JWT (`session.user.id`). `src/app/(app)/layout.tsx` redirects to `/login` without a session and
  to `/onboarding` until `users.onboarded_at` is set.
- Server Actions call `requireUser()` and pass that id into every lib call; nothing identity-related comes from the client.

## Onboarding (`/onboarding` → `/onboarding/confirm`)
One form: weight, height, age, sex, **goal** (recomp / fat loss / muscle gain), **gym or home** (home shows an equipment
picker: bodyweight only, dumbbells, bands, pull-up bar), days per week, minutes per session. `completeOnboarding` computes the
targets (`src/lib/targets.ts`: Mifflin-St Jeor × activity factor → kcal ± 25, protein g/kg range), writes the user's
`settings` row (single protein range; owner-only columns stay null), creates Push/Pull/Legs for gym users (home users get an
empty workout-type list for now), marks `users.onboarded_at` and shows the confirm page: targets + `/start <code>` for the
bot. Already-onboarded users are redirected to Today, so targets are never recomputed behind someone's back.

## Settings layout
**Everyday**
- **Targets**: kcal target/range, protein (per phase for the owner, one range for everyone else), steps, budgets only when the
  user has them (`targets-form.tsx`)
- **Protein phase**: auto by date, or an override (`phase-section.tsx`); only shown to users with phases (the owner)
- **Telegram**: link status / code (`telegram-card.tsx`)
- **Telegram reminders**: 4 main toggles. "More reminders, quiet hours, daily cap" folds the rest (`nudge-settings.tsx`)

**Setup: rarely changed** (all collapsed)
- **Foods & My meals**: edit, favourite ★, archive (`foods-editor.tsx`). Saved meals show here with the serving "1 meal".
- **Workout types** (`workout-types-editor.tsx`): sessions-per-week target · each active type (▲▼ = rotation order, Rename,
  Archive; expand for its exercises: order, sets × reps, cues, + Exercise) · Add type · Archived list with Restore.
  Names are bot commands: a reserved bot word (`BOT_COMMAND_WORDS`, incl. the cardio words walk/run/…) or a duplicate is refused; a food with the same name only warns.
- **Body & habits**: onboarding stats + smoke-free date (`body-stats-form.tsx`)
- **Export data**: one CSV per table (`/api/export/<table>`), the signed-in user's rows only (exercises: library + own).
  `settings` and `users` are never exported.
- **People** (admins only, read-only, `people.tsx`): every account with email, onboarded yes/no, Telegram linked yes/no.

All mutations are in `src/app/(app)/settings/actions.ts` (each scoped with `forUser(userId)`). Shared UI bits (Card with
`collapsible`, Field, Status) are in `settings/ui.tsx`. Cues can only be edited on the user's own custom exercises; library cues are shared.

## Files
| File | Role |
|---|---|
| `auth.ts`, `src/lib/session.ts`, `src/lib/users.ts` | Allowlist, `requireUser`, users rows (details in [../users.md](../users.md)) |
| `src/app/login/page.tsx`, `src/app/(app)/layout.tsx` | Sign-in page; the gate |
| `src/app/onboarding/{page,onboarding-form,actions}.tsx`, `onboarding/confirm/page.tsx` | Onboarding flow |
| `src/app/(app)/settings/page.tsx`, `actions.ts`, `ui.tsx` | Settings screen, every mutation, shared bits |
| `settings/targets-form.tsx`, `phase-section.tsx`, `telegram-card.tsx`, `nudge-settings.tsx` | Everyday cards |
| `settings/foods-editor.tsx`, `workout-types-editor.tsx`, `body-stats-form.tsx`, `people.tsx` | Setup cards; admin People |
| `src/lib/targets.ts`, `src/lib/settings.ts` | Targets per goal; `hasPhases` / `hasBudgets` / `hasNavelGoal` |
