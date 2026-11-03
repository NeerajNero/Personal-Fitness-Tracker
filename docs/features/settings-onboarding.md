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
empty workout-type list; the Today card builds Day A/B/C after one question), marks `users.onboarded_at` and shows the confirm page: targets + `/start <code>` for the
bot. Already-onboarded users are redirected to Today, so targets are never recomputed behind someone's back.
The form's schema and state types are in `src/lib/onboarding.ts`, not the action file: a `"use server"` module may export
only async functions, and Next refuses the whole module otherwise (the bug that broke the second account's onboarding;
`pnpm test` checks every such file). **Resumable:** a settings row left by a failed attempt (users.onboarded_at still null)
is updated in place, link code and date kept, and gym starter types are not duplicated, so submitting again just works.
Like every action, it runs under `action("completeOnboarding", …)`: a throw becomes an `action` diag event before Next's error page.

## Settings layout
**Everyday**
- **Targets**: kcal target/range, protein (per phase for the owner, one range for everyone else), steps, budgets only when the
  user has them (`targets-form.tsx`)
- **Protein phase**: auto by date, or an override (`phase-section.tsx`); only shown to users with phases (the owner)
- **Telegram**: link status / code (`telegram-card.tsx`)
- **Telegram reminders**: 4 main toggles. "More reminders, quiet hours, daily cap" folds the rest (`nudge-settings.tsx`)

**Setup: rarely changed** (all collapsed)
- **Foods and My meals**: grouped under veg / non-veg icons; edit, star into My meals, archive (`foods-editor.tsx`). Saved meals show here with the serving "1 meal".
- **Workout types** (`workout-types-editor.tsx`): a note for home users with no types yet (the card on Today builds Day A/B/C)
  · sessions-per-week target · each active type (up/down = rotation order, Rename,
  Archive; expand for its exercises: order, sets × reps, cues, + Exercise) · Add type · Archived list with Restore.
  Names are bot commands: a reserved bot word (`BOT_COMMAND_WORDS`, incl. the cardio words walk/run/…) or a duplicate is refused; a food with the same name only warns.
  Ladder exercises show "rung n of m" with up / down (`setRoutineRung`), finishers show "10 min", holds target seconds; "Add an
  exercise" filters by the user's equipment with a "Show all" toggle ([../home-program.md](../home-program.md)).
- **Body & habits**: onboarding stats + smoke-free date (`body-stats-form.tsx`)
- **Export data**: one CSV per table (`/api/export/<table>`), the signed-in user's rows only (exercises: library + own).
  `settings` and `users` are never exported.
- **People** (admins only, read-only, `people.tsx`): every account with email, "not in ALLOWED_EMAILS" when their row has
  outlived the list, onboarded yes/no, and Telegram linked / no chat / **blocked** (a send got 403; clears on their next message).

**When something's off** (outside Setup, above Sign out)
- **Diagnostics** (`diagnostics.tsx`, loads on open via `diag-actions.ts`): every user sees their account, session, Telegram
  link (chat masked), row counts, today's DayState, device/PWA state, their last 20 events and client errors; admins also
  get the System and People sections, 50 events across users and **Run tick (dry)**. **Copy diagnostics** = the whole thing
  as plain text, no secrets. Details in [../diagnostics.md](../diagnostics.md).

All mutations are in `src/app/(app)/settings/actions.ts` (each scoped with `forUser(userId)`). Shared UI bits (Card with
`collapsible`, Field, Status) are in `settings/ui.tsx`. Cues can only be edited on the user's own custom exercises; library cues are shared.

## Files
| File | Role |
|---|---|
| `auth.ts`, `src/lib/session.ts`, `src/lib/users.ts` | Allowlist, `requireUser`, users rows (details in [../users.md](../users.md)) |
| `src/app/login/page.tsx`, `src/app/(app)/layout.tsx` | Sign-in page; the gate |
| `src/app/onboarding/{page,onboarding-form,actions}.tsx`, `onboarding/confirm/page.tsx` | Onboarding flow |
| `src/lib/onboarding.ts` | The form's zod schema and state types (client-safe; kept out of the `"use server"` file) |
| `src/lib/action-result.ts` | `action()` / `run()` wrapper around every action (failures → diag events), `fail()`, `ActionResult` |
| `src/app/(app)/settings/page.tsx`, `actions.ts`, `ui.tsx` | Settings screen, every mutation, `Field` / `Status` (the classes come from `src/components/ui.tsx`) |
| `settings/targets-form.tsx`, `phase-section.tsx`, `telegram-card.tsx`, `nudge-settings.tsx` | Everyday cards |
| `settings/foods-editor.tsx`, `workout-types-editor.tsx`, `body-stats-form.tsx`, `people.tsx` | Setup cards; admin People |
| `settings/diagnostics.tsx`, `diag-actions.ts`, `src/lib/diag/*` | Diagnostics card; the actions wrap `buildDiagnostics` / `runTickDryAs` (admin gate in the lib) |
| `src/lib/targets.ts`, `src/lib/settings.ts` | Targets per goal; `hasPhases` / `hasBudgets` / `hasNavelGoal` |
