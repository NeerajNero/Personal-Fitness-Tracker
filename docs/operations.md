# Operations: run, migrate, deploy

## Environment (`.env`, never `.env.local`; template in `.env.example`)
`DATABASE_URL` `AUTH_SECRET` `AUTH_GOOGLE_ID` `AUTH_GOOGLE_SECRET` `ALLOWED_EMAIL` `TELEGRAM_BOT_TOKEN`
`TELEGRAM_BOT_USERNAME` `TELEGRAM_WEBHOOK_SECRET` `TICK_SECRET` `GEMINI_API_KEY` `GEMINI_MODEL` (optional) `NEXT_PUBLIC_APP_URL`

Next.js and drizzle-kit load `.env` automatically. Standalone scripts use `node --env-file=.env` (already wired into
the package scripts). Scripts that import `src/db` also need `--conditions=react-server` (already in the package scripts),
because `src/db/index.ts` imports `server-only`, which throws under plain Node. **Never print `.env` or any variable's value.** To check a variable, report only `NAME: set` or `NAME: not set`.

## Local
```bash
pnpm install
pnpm db:migrate        # apply drizzle/ migrations to DATABASE_URL
pnpm seed              # idempotent (Push/Pull/Legs + exercise library on a fresh db)
pnpm dev
```

## Checks before committing
```bash
pnpm exec next typegen && pnpm exec tsc --noEmit   # typegen first: PageProps/LayoutProps live in .next/types
pnpm lint
pnpm build             # when routes, config or server/client boundaries changed
```
There is no test suite. For pure logic (e.g. `parseCommand`), a throwaway `node --import=tsx` script in a scratch dir works.

## Deploy (Vercel Hobby)
1. Push → Vercel builds. Set every env var in Vercel.
2. Run new migrations against production: `pnpm db:migrate`.
3. Telegram webhook: `pnpm bot:set-webhook https://<app>` (sends `TELEGRAM_WEBHOOK_SECRET` as the secret token).
4. Scheduler: cron-job.org → `GET https://<app>/api/tick` every 15 min with the header `x-tick-secret: <TICK_SECRET>`.
   **Never add `crons` to vercel.json.** Hobby cron is daily-only.

## Data scripts (owner runs them)
`pnpm choose-day:dry` → review → `pnpm choose-day` (after migration 0005): Push/Pull/Legs, archive Upper/Lower,
"no training" marks → rest days. Idempotent; it prints any exercise name it couldn't match.

## Debugging reminders
`pnpm tick:dry` (evaluate only) · `pnpm tick force=<rule key>` (send now, still logged). Uses `TICK_URL`
(default `http://localhost:3000`). Put the production URL in `TICK_URL` to force rules there. The response lists rule keys and skip reasons, never message bodies.
