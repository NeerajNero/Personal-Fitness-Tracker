/** Client-safe list of exportable tables (mirrors src/app/api/export/[table]/route.ts). */
export const EXPORT_TABLES = [
  "foods", "food_log", "daily_metrics", "measurements", "exercises", "routine_days",
  "routine_exercises", "sessions", "session_exercises", "sets", "activities", "nudge_log",
] as const;
