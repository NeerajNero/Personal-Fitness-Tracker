# Telegram bot

The primary daily interface. grammY in webhook mode at `/api/telegram`. Proactive messages come from `/api/tick`
(see [../rules-engine.md](../rules-engine.md)).

## Commands (exact match, no AI) → `parse.ts` then `ops.ts`
| Message | Does |
|---|---|
| `w 74.2` | weight |
| `s 8500` | steps |
| `dosa 350 12` | manual meal: name, kcal, protein (numbers from the owner's outside photo estimate) |
| `paneer 150` · `roti 3` · `scoop` · `<saved meal name>` | catalogue food: no number = 1 serving, < 10 = servings, ≥ 10 = grams via `serving_grams`. Aliases in `ALIASES` (scoop→whey, egg→whole egg…) |
| `copy` / `same` | copy yesterday's food log (only onto an empty today) |
| `push` · `pull` · `legs` (any active type name) · `rest` | set today's day; a type replies with its exercise list + **✓ All same as last time** |
| `incline 20 4.5 6%` · `walk 30 5` · `run 25 4.2km hard` · `cycle`/`bike 40 15km` · `cross 20` · `stairs 10` · `swim 30` · `sport badminton 45` | cardio: first number = minutes; then in any order a bare number = km/h, `4.2km`, `6%`, easy / mod / hard. Replies with the entry (derived distance or pace) + today's cardio total |
| `cardio` | repeat the most recent cardio entry for today |
| `done` | log the chosen type as same as last time (`copyLastSets`); day unset or rest → "What did you do today?" type buttons |
| `today` | DayState summary (incl. cardio) |
| `undo` | delete today's newest entry, food or cardio, whichever was logged last |
| `navel 88.5` · `waist 85` | measurement, upserted by date |
| `water` | +1 glass (only when the water toggle is on) |
| `help` / `/start` | help text (`HELP` in `messages.ts`) |

Order matters in `parseCommand`: keywords → `w` → `s` → navel/waist → **cardio** (`parseCardio`, so `walk 30 5` isn't a meal) →
`name kcal protein` → `name [n]`. Cardio validation errors reply with the reason instead of falling through to AI.
Then, for a bare word (food with no number), `matchPlanWord` checks `rest` and active type names **before** food matching.
A food name that matches nothing in the catalogue falls through to AI. Type names can't be bot keywords (Settings blocks them).

## Free text → Gemini (`ai.ts`)
Anything else goes to Gemini (`GEMINI_MODEL`, default `gemini-3.5-flash-lite`, JSON-schema output) along with the foods list →
items (matched or estimated) + totals → a reply with **✓ Log / ✗ Cancel** buttons. The DB is written only on ✓.
The parse is stored in `pending_parses`, and only its id goes in the callback data. Pending parses expire after 24 h.
On any failure (network, 429, bad JSON) the bot replies "couldn't parse that — try `paneer 150` style".

## Rules
- Only `settings.telegram_chat_id` is served. Other chats are ignored silently. Before linking, only `/start <code>` works.
- Never log message bodies, tokens or chat ids (`bot.catch` logs the error class only).
- Every log reply ends with the running total (`runningLine`) and the overage line if over target (`withOverage`).
- Day buttons: `plan:<date>:<typeId|rest>` sets the day (morning brief), `did:<date>:<typeId|rest|same>` sets and logs it
  (day close, `done`, the type reply). Legacy `nudge:done` / `nudge:skip` still work. Choices that would replace a session
  with sets reply with an app link instead of changing anything.

## Files
`src/lib/telegram/`: `bot.ts` (middleware gate, handlers, callbacks), `parse.ts` (pure: `parseCommand`, `matchPlanWord`, `matchFood`,
`servingsFor`), `ops.ts` (one function per command), `messages.ts` (HTML templates), `ai.ts`, `send.ts`, `env.ts`.
Webhook management: `pnpm bot:set-webhook <url>`, `pnpm bot:webhook-info`, `pnpm bot:delete-webhook`.
