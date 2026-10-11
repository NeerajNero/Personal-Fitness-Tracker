/** All rules and calendar logic run in IST. Storage is UTC; this file is the only place that converts. */
export const IST = "Asia/Kolkata";

const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const hms = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const dayLabel = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** IST calendar date as "YYYY-MM-DD" (matches the pg `date` columns). */
export function todayIST(now: Date = new Date()): string {
  return ymd.format(now);
}

/** IST wall-clock time as "HH:MM:SS" (matches the pg `time` columns). */
export function nowTimeIST(now: Date = new Date()): string {
  return hms.format(now);
}

export function isValidIsoDate(s: string): boolean {
  return ISO_DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

function utcMidnight(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, n: number): string {
  const d = utcMidnight(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: string): number {
  const d = utcMidnight(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Whole days from `fromIso` to `toIso` (positive when `toIso` is later). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((utcMidnight(toIso).getTime() - utcMidnight(fromIso).getTime()) / 86_400_000);
}

/** "Sat 11 Oct" */
export function formatDayLabel(iso: string): string {
  return dayLabel.format(utcMidnight(iso));
}

/* ------------------------------- IST clock -------------------------------- */

export type IstNow = {
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM"
  minutes: number; // minutes since IST midnight
  weekday: number; // ISO 1 = Mon … 7 = Sun
  dayOfMonth: number;
};

export function istNow(now: Date = new Date()): IstNow {
  const date = todayIST(now);
  const hms = nowTimeIST(now);
  const [h, m] = hms.split(":").map(Number);
  return { date, time: hms.slice(0, 5), minutes: h * 60 + m, weekday: isoWeekday(date), dayOfMonth: Number(date.slice(8, 10)) };
}

/** "HH:MM" or "HH:MM:SS" → minutes since midnight. */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Quiet window may wrap midnight (22:30–07:00). End is exclusive. */
export function inQuietHours(minutes: number, start: string, end: string): boolean {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === e) return false;
  return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
}
