const DAYS_PER_UNIT: Record<string, number> = { week: 7, month: 30, year: 365 };

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

const DURATION_PATTERN = /\b(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(week|month|year)s?\b/gi;

/**
 * Adds the length in days after each period the customer mentions: "5 weeks ago" -> "5 weeks (= 35 days) ago".
 * Policies state limits in days, and the model was measured comparing "5 weeks" with "30 days" wrongly,
 * so the conversion is done in code, like the flyer dates. Months count as 30 days.
 */
export function annotateDurations(message: string): string {
  return message.replace(DURATION_PATTERN, (match, amount: string, unit: string) => {
    const count = NUMBER_WORDS[amount.toLowerCase()] ?? Number(amount);
    const days = Math.round(count * DAYS_PER_UNIT[unit.toLowerCase()]!);
    return `${match} (= ${days} days)`;
  });
}
