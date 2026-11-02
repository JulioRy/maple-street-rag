import type { Chunk } from "../types.js";

/**
 * Computed in code so the model never has to compare dates itself.
 * Returns undefined for chunks that have no sale period.
 */
export function flyerStatus(chunk: Pick<Chunk, "validFrom" | "validTo">, today: string): string | undefined {
  const { validFrom, validTo } = chunk;
  if (!validFrom || !validTo) return undefined;

  // ISO dates (YYYY-MM-DD) compare correctly as strings.
  if (today < validFrom) return `UPCOMING, starts ${validFrom}, ends ${validTo}`;
  if (today > validTo) return `EXPIRED on ${validTo}`;
  return `ACTIVE today, ends ${validTo}`;
}
