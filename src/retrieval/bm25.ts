import type { Chunk, ScoredChunk } from "../types.js";

// Standard BM25 parameters: term-frequency saturation and length normalization.
const K1 = 1.2;
const B = 0.75;

const STOPWORDS = new Set(
  "a an and are as at be but by can do does for from how i if in is it its me my of on or our so that the this to was we what when where which who will with you your".split(" "),
);

export interface Bm25Index {
  search(query: string, limit: number): ScoredChunk[];
}

export function buildBm25Index(chunks: Chunk[]): Bm25Index {
  const documents = chunks.map((chunk) => termCounts(tokenize(chunk.text)));
  const lengths = documents.map((counts) => sum(counts.values()));
  const averageLength = sum(lengths) / Math.max(chunks.length, 1);

  const documentFrequency = new Map<string, number>();
  for (const counts of documents) {
    for (const term of counts.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }

  const inverseDocumentFrequency = (term: string) => {
    const frequency = documentFrequency.get(term) ?? 0;
    return Math.log(1 + (chunks.length - frequency + 0.5) / (frequency + 0.5));
  };

  return {
    search(query, limit) {
      const queryTerms = [...new Set(tokenize(query))];
      return chunks
        .map((chunk, i) => {
          let score = 0;
          for (const term of queryTerms) {
            const frequency = documents[i]!.get(term) ?? 0;
            if (frequency === 0) continue;
            const lengthNorm = 1 - B + (B * lengths[i]!) / averageLength;
            score += inverseDocumentFrequency(term) * ((frequency * (K1 + 1)) / (frequency + K1 * lengthNorm));
          }
          return { chunk, score };
        })
        .filter((result) => result.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
  };
}

/** Lowercase words and numbers, stopwords removed, with a light plural strip ("shovels" -> "shovel"). */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((token) => !STOPWORDS.has(token)).map(stem);
}

function stem(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function termCounts(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}
