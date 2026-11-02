import { describe, expect, it } from "vitest";
import { buildBm25Index, tokenize } from "../src/retrieval/bm25.js";
import { reciprocalRankFusion } from "../src/retrieval/hybridSearch.js";
import { cosineSimilarity } from "../src/retrieval/vectorStore.js";
import type { Chunk, ScoredChunk } from "../src/types.js";

function chunk(chunkId: string, text: string): Chunk {
  return { file: chunkId.split("#")[0]!, chunkId, title: "t", effective: "2026-01-01", text };
}

describe("tokenize", () => {
  it("lowercases, drops stopwords and strips plurals", () => {
    expect(tokenize("Do you have Snow Shovels in stock?")).toEqual(["have", "snow", "shovel", "stock"]);
  });

  it("keeps product tokens like 20V", () => {
    expect(tokenize("20V Brushless")).toEqual(["20v", "brushless"]);
  });
});

describe("BM25", () => {
  const chunks = [
    chunk("prices.csv#1", "name: Cordless Drill 18V | price_usd: 89.99"),
    chunk("prices.csv#2", "name: Cordless Drill 20V Brushless Kit | price_usd: 149.00"),
    chunk("prices.csv#3", "name: Drywall Screws 1 lb | aisle: 6"),
  ];
  const index = buildBm25Index(chunks);

  it("ranks the exact product name first", () => {
    expect(index.search("20V brushless drill", 3)[0]?.chunk.chunkId).toBe("prices.csv#2");
  });

  it("returns only chunks that share a term with the query", () => {
    expect(index.search("drywall screws", 3).map((r) => r.chunk.chunkId)).toEqual(["prices.csv#3"]);
  });
});

describe("reciprocalRankFusion", () => {
  const a = chunk("a.md#1", "a");
  const b = chunk("b.md#1", "b");
  const c = chunk("c.md#1", "c");
  const ranking = (...chunks: Chunk[]): ScoredChunk[] => chunks.map((ch) => ({ chunk: ch, score: 1 }));

  it("puts a chunk found by both methods above chunks found by only one", () => {
    const fused = reciprocalRankFusion([ranking(a, b), ranking(c, b)]);
    expect(fused[0]?.chunk.chunkId).toBe("b.md#1");
    expect(fused).toHaveLength(3);
  });
});

describe("cosineSimilarity", () => {
  it("is 1 for the same direction and 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });
});
