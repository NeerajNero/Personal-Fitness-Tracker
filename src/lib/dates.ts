/** All rules and calendar logic run in IST. Storage is UTC; this file is the only place that converts. */
export const IST = "Asia/Kolkata";

const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** IST calendar date as "YYYY-MM-DD" (matches the pg `date` columns). */
export function todayIST(now: Date = new Date()): string {
  return ymd.format(now);
}
