import { createApp } from "./app.js";
import { createChatService } from "./chat/answer.js";
import { createSessionStore } from "./chat/sessionStore.js";
import { loadConfig } from "./config.js";
import { createKnowledgeBase } from "./knowledgeBase.js";
import { withEmbeddingCache } from "./llm/embeddingCache.js";
import { createProvider } from "./llm/provider.js";

const EMBEDDING_CACHE_FILE = ".cache/embeddings.json";

async function main(): Promise<void> {
  const config = loadConfig();
  const provider = await withEmbeddingCache(createProvider(config), EMBEDDING_CACHE_FILE, config.embeddingModel);
  const knowledgeBase = createKnowledgeBase(config.DOCS_DIR, provider);

  // Ingest before listening, so the server is ready to answer as soon as it accepts requests.
  const report = await knowledgeBase.reload();
  console.log(`Ingested ${report.indexed.length} files into ${report.chunks} chunks; skipped ${report.skipped.length}:`);
  for (const { file, reason } of report.skipped) console.log(`  - ${file}: ${reason}`);

  const answer = createChatService({
    provider,
    search: (query, k) => knowledgeBase.search(query, k),
    sessions: createSessionStore(),
    k: config.RETRIEVAL_K,
  });

  const app = createApp({
    answer,
    runIngest: () => knowledgeBase.reload(),
    retrieve: (query, k) => knowledgeBase.search(query, k),
    usage: () => provider.usage(),
  });

  app.listen(config.PORT, () => {
    console.log(
      `Maple Street assistant listening on http://localhost:${config.PORT} (${config.LLM_PROVIDER}: ${config.chatModel}, ${config.embeddingModel})`,
    );
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
