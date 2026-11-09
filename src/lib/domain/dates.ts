/**
 * Date-only helpers. Allocation and capacity dates are plain "YYYY-MM-DD"
 * strings so timezone conversion can never move work to another day.
 * All arithmetic is done in UTC on the calendar date itself.
 */
export type DateOnly = string; // "YYYY-MM-DD"

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateOnly(value: string): value is DateOnly {
  const m = DATE_ONLY.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

function toUtc(date: DateOnly): Date {
  if (!isDateOnly(date)) throw new Error(`Invalid date: ${date}`);
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(d: Date): DateOnly {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: DateOnly, days: number): DateOnly {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: DateOnly): number {
  return (toUtc(date).getUTCDay() + 6) % 7;
}

/** Monday of the week containing `date` (Monday-start weeks). */
export function startOfWeek(date: DateOnly): DateOnly {
  return addDays(date, -weekdayIndex(date));
}

/** Monday to Sunday of the week containing `date`. */
export function weekDates(date: DateOnly): DateOnly[] {
  const monday = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** DD/MM/YYYY display format. */
export function formatDateGB(date: DateOnly): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** Today's calendar date in the business timezone (e.g. Europe/London). */
export function todayIn(timeZone: string, now: Date = new Date()): DateOnly {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Display a stored UTC timestamp in the business timezone, DD/MM/YYYY HH:mm. */
export function formatTimestamp(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(iso))
    .replace(",", "");
}
