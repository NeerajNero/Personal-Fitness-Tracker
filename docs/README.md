# Docs index

Short, task-scoped docs. **Read only the doc for the area you're touching.** Each one lists its source files, so you
can open those directly instead of searching the repo.

| If you're working on… | Read |
|---|---|
| Goals, targets, phases, verdict rules, seed data, "should we build X?" | [product.md](product.md) |
| Where things live, shared modules, client/server boundary | [architecture.md](architecture.md) |
| Tables, columns, views, migrations, seed | [data-model.md](data-model.md) |
| Food logging, My meals, weight/steps | [features/today.md](features/today.md) |
| Workout logging, ✓ same as last time, hints, stalls | [features/train.md](features/train.md) |
| Charts, verdict, checkpoint, maintenance, export | [features/trends.md](features/trends.md) |
| Settings screens, onboarding, sign-in | [features/settings-onboarding.md](features/settings-onboarding.md) |
| Bot commands, Gemini parsing | [features/telegram-bot.md](features/telegram-bot.md) |
| Reminders, `/api/tick`, `getDayState` | [rules-engine.md](rules-engine.md) |
| Env, local setup, checks, deploy, webhook, cron | [operations.md](operations.md) |
| What changed and when | [../CHANGELOG.md](../CHANGELOG.md) |

## Keeping docs true
- Docs describe **current behaviour**, not history. History goes in `CHANGELOG.md`.
- Change behaviour → update that feature's doc in the same commit (what the owner sees, behaviour rules, file table).
- New file or moved responsibility → update the doc's **Files** table (and `architecture.md` if it's shared).
- New table/column/view → `data-model.md`. New reminder → the table in `rules-engine.md`.
- Keep each doc under ~120 lines. If one grows past that, split it rather than padding it.
- If the code and a doc disagree, the code wins: fix the doc and mention it in the commit message.
