import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LlmProvider } from "./provider.js";

interface CacheFile {
  model: string;
  vectors: Record<string, number[]>;
}

/**
 * Wraps a provider so each distinct text is embedded once. Unchanged chunks are never re-embedded
 * on /ingest or on restart, which keeps re-ingest fast and inside free-tier rate limits.
 * The cache is keyed by model, so changing EMBEDDING_MODEL starts from an empty cache.
 */
export async function withEmbeddingCache(provider: LlmProvider, cacheFilePath: string, model: string): Promise<LlmProvider> {
  const vectors = await readCache(cacheFilePath, model);

  async function persist(): Promise<void> {
    const content: CacheFile = { model, vectors: Object.fromEntries(vectors) };
    await mkdir(path.dirname(cacheFilePath), { recursive: true });
    await writeFile(cacheFilePath, JSON.stringify(content));
  }

  return {
    ...provider,
    async embed(texts, kind) {
      const keyOf = (text: string) => createHash("sha256").update(`${kind}\n${text}`).digest("hex");
      const missing = [...new Set(texts.filter((text) => !vectors.has(keyOf(text))))];

      if (missing.length > 0) {
        const fresh = await provider.embed(missing, kind);
        missing.forEach((text, i) => vectors.set(keyOf(text), fresh[i]!));
        // Rewrite the file only when new document embeddings arrive, not on every chat query.
        if (kind === "document") await persist();
      }
      return texts.map((text) => vectors.get(keyOf(text))!);
    },
  };
}

async function readCache(cacheFilePath: string, model: string): Promise<Map<string, number[]>> {
  try {
    const content = JSON.parse(await readFile(cacheFilePath, "utf8")) as CacheFile;
    return content.model === model ? new Map(Object.entries(content.vectors)) : new Map();
  } catch {
    // Missing or unreadable cache: start empty, it is only an optimization.
    return new Map();
  }
}
