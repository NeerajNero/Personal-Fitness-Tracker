# Docs index

Short, task-scoped docs. **Read only the doc for the area you're touching.** Each one ends with the files it covers, so
you can open those directly instead of searching the repo.

| If you're working on… | Read |
|---|---|
| Goals, targets per goal, the owner's seed values, "should we build X?" | [product.md](product.md) |
| Where things live, shared modules, client/server boundary | [architecture.md](architecture.md) |
| Tables, columns, views, migrations, seed | [data-model.md](data-model.md) |
| Accounts, sign-in, the scoping rule, onboarding, verdicts per goal, owner-only values | [users.md](users.md) |
| Food logging, My meals, weight/steps | [features/today.md](features/today.md) |
| Workout logging, ✓ same as last time, hints, stalls | [features/train.md](features/train.md) |
| Cardio log (types, fields, repeat, bot syntax, charts) | [features/cardio.md](features/cardio.md) |
| Charts, verdict, checkpoint, maintenance, export | [features/trends.md](features/trends.md) |
| Settings screens, onboarding form, People | [features/settings-onboarding.md](features/settings-onboarding.md) |
| Bot commands, chat → user, Gemini parsing | [features/telegram-bot.md](features/telegram-bot.md) |
| Reminders, `/api/tick`, `getDayState` | [rules-engine.md](rules-engine.md) |
| Env, deploy order for migrations, webhook, tick by hand, adding/removing a person, backups | [operations.md](operations.md) |
| `pnpm test`, PGlite, adding a test | [testing.md](testing.md) |
| Something's broken | [troubleshooting.md](troubleshooting.md) |
| What changed and when | [../CHANGELOG.md](../CHANGELOG.md) |
| First-time setup from zero | [../README.md](../README.md) |

## Keeping docs true
- Docs describe **current behaviour**, not history. History goes in `CHANGELOG.md`.
- Every step updates the README (if setup, scripts or operations changed), the docs it touches and `CHANGELOG.md`
  **before** its commit; code and docs land together.
- New file or moved responsibility → update the doc's **Files** table (and `architecture.md` if it's shared).
- New table/column/view → `data-model.md`. New reminder → the table in `rules-engine.md`. Anything about accounts → `users.md`.
- Keep each doc under ~120 lines. If one grows past that, split it rather than padding it.
- If the code and a doc disagree, the code wins: fix the doc and mention it in the commit message.
