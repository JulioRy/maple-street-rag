const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * Finds a sale period written in the body, for example
 * "Valid Monday, November 2 through Sunday, November 15, 2026."
 * The weekday and the first year are optional; "through", "to", "until" and dashes are accepted.
 */
const VALIDITY_PATTERN =
  /\bvalid\s+(?:from\s+)?(?:[a-z]+day,?\s+)?([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?\s*(?:through|until|to|-|–)\s*(?:[a-z]+day,?\s+)?([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/i;

export interface ValidityRange {
  validFrom: string;
  validTo: string;
}

export function parseValidityRange(text: string): ValidityRange | undefined {
  const match = VALIDITY_PATTERN.exec(text);
  if (!match) return undefined;

  const [, startMonthName, startDay, startYearText, endMonthName, endDay, endYearText] = match;
  const startMonth = monthNumber(startMonthName!);
  const endMonth = monthNumber(endMonthName!);
  if (!startMonth || !endMonth) return undefined;

  const endYear = Number(endYearText);
  // "December 28 through January 3, 2027" starts in the previous year.
  const startYear = startYearText ? Number(startYearText) : startMonth > endMonth ? endYear - 1 : endYear;

  return {
    validFrom: isoDate(startYear, startMonth, Number(startDay)),
    validTo: isoDate(endYear, endMonth, Number(endDay)),
  };
}

function monthNumber(name: string): number | undefined {
  const index = MONTHS.indexOf(name.toLowerCase());
  return index === -1 ? undefined : index + 1;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
