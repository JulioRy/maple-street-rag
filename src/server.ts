import { createApp } from "./app.js";
import { createChatService } from "./chat/answer.js";
import { createSessionStore } from "./chat/sessionStore.js";
import { loadConfig } from "./config.js";
import { createKnowledgeBase } from "./knowledgeBase.js";
import { withEmbeddingCache } from "./llm/embeddingCache.js";
import { createGeminiProvider } from "./llm/provider.js";

const EMBEDDING_CACHE_FILE = ".cache/embeddings.json";

async function main(): Promise<void> {
  const config = loadConfig();
  const gemini = createGeminiProvider({
    apiKey: config.GEMINI_API_KEY,
    chatModel: config.CHAT_MODEL,
    embeddingModel: config.EMBEDDING_MODEL,
    timeoutMs: config.MODEL_TIMEOUT_MS,
  });
  const provider = await withEmbeddingCache(gemini, EMBEDDING_CACHE_FILE, config.EMBEDDING_MODEL);
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
    console.log(`Maple Street assistant listening on http://localhost:${config.PORT} (chat model ${config.CHAT_MODEL})`);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
