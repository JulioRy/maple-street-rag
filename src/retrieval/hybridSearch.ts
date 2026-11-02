import type { IndexedChunk, ScoredChunk } from "../types.js";
import { buildBm25Index, type Bm25Index } from "./bm25.js";
import { vectorSearch } from "./vectorStore.js";

/** The standard RRF constant: dampens the gap between rank 1 and rank 2 so neither list dominates. */
const RRF_K = 60;
/** How deep each method's ranking goes before fusion. */
const CANDIDATES_PER_METHOD = 30;

export interface SearchIndex {
  chunks: IndexedChunk[];
  bm25: Bm25Index;
}

export function buildSearchIndex(chunks: IndexedChunk[]): SearchIndex {
  return { chunks, bm25: buildBm25Index(chunks) };
}

/**
 * Embeddings catch paraphrases ("Christmas Eve" vs "December 24"); BM25 catches exact tokens
 * ("20V", "drywall screws", SKUs). Reciprocal Rank Fusion merges the two rankings by position,
 * so there are no score scales or weights to tune.
 */
export function hybridSearch(index: SearchIndex, query: string, queryEmbedding: number[], k: number): ScoredChunk[] {
  const byVector = vectorSearch(index.chunks, queryEmbedding, CANDIDATES_PER_METHOD);
  const byKeyword = index.bm25.search(query, CANDIDATES_PER_METHOD);
  return reciprocalRankFusion([byVector, byKeyword]).slice(0, k);
}

export function reciprocalRankFusion(rankings: ScoredChunk[][]): ScoredChunk[] {
  const fused = new Map<string, ScoredChunk>();
  for (const ranking of rankings) {
    ranking.forEach(({ chunk }, position) => {
      const contribution = 1 / (RRF_K + position + 1);
      const existing = fused.get(chunk.chunkId);
      fused.set(chunk.chunkId, { chunk, score: (existing?.score ?? 0) + contribution });
    });
  }
  return [...fused.values()].sort((a, b) => b.score - a.score);
}
