import type { IndexedChunk, ScoredChunk } from "../types.js";

/**
 * The "vector store" is a plain array scanned in full: ~160 chunks take well under a millisecond.
 * See DECISIONS.md for when this should become pgvector.
 */
export function vectorSearch(chunks: IndexedChunk[], queryEmbedding: number[], limit: number): ScoredChunk[] {
  return chunks
    .map((chunk) => ({ chunk, score: cosineSimilarity(chunk.embedding, queryEmbedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`Embedding size mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
