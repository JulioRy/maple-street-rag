import { buildChunks } from "./ingest/index.js";
import type { LlmProvider } from "./llm/provider.js";
import { buildSearchIndex, hybridSearch, type SearchIndex } from "./retrieval/hybridSearch.js";
import type { IngestReport, ScoredChunk } from "./types.js";

export interface KnowledgeBase {
  /** Re-reads the docs folder and swaps in the new index. Safe to call while the server is answering. */
  reload(): Promise<IngestReport>;
  search(query: string, k: number): Promise<ScoredChunk[]>;
}

export function createKnowledgeBase(docsDir: string, provider: LlmProvider): KnowledgeBase {
  let index: SearchIndex = buildSearchIndex([]);
  let reloadInProgress: Promise<IngestReport> | undefined;

  async function rebuild(): Promise<IngestReport> {
    const { chunks, report } = await buildChunks(docsDir);
    const embeddings = await provider.embed(
      chunks.map((chunk) => chunk.text),
      "document",
    );
    // Build the full new index first, then swap: requests never see a half-built index.
    index = buildSearchIndex(chunks.map((chunk, i) => ({ ...chunk, embedding: embeddings[i]! })));
    return report;
  }

  return {
    reload() {
      // Two /ingest calls at once share one rebuild instead of racing.
      reloadInProgress ??= rebuild().finally(() => {
        reloadInProgress = undefined;
      });
      return reloadInProgress;
    },

    async search(query, k) {
      if (index.chunks.length === 0) return [];
      const [queryEmbedding] = await provider.embed([query], "query");
      return hybridSearch(index, query, queryEmbedding!, k);
    },
  };
}
