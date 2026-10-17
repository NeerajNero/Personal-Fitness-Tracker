# Recomp

A personal fitness tracker for a 1-year body recomposition (Oct 2026 → Oct 2027). It's a web app (PWA) plus a Telegram bot.
Log weight, food (kcal + protein) and lifts in seconds. It tells you each week whether to change anything.

**Daily use is mostly Telegram:** `w 74.2` · `dosa 350 12` · `copy` · `done` · `navel 88.5` · `today`.
The app is for tapping a saved meal, editing a lift that progressed, and checking Trends.

## Stack
Next.js 16 (App Router, TypeScript, Tailwind v4) · Neon Postgres + Drizzle · Auth.js (Google, single allowed email) ·
grammY Telegram bot · Gemini flash-lite for free-text meal parsing · Vercel Hobby + cron-job.org.

## Quick start
```bash
cp .env.example .env    # fill in values (see comments in the file)
pnpm install
pnpm db:migrate && pnpm seed
pnpm dev
```

## Docs
- [docs/README.md](docs/README.md): index; read the one doc for the area you're changing
- [CHANGELOG.md](CHANGELOG.md): what changed and when
- [CLAUDE.md](CLAUDE.md): rules for AI-assisted changes (also a useful summary of the conventions)
