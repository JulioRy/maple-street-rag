const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Today's date in the server's local time zone, as YYYY-MM-DD. */
export function systemToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
