import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withEmbeddingCache } from "../src/llm/embeddingCache.js";
import type { LlmProvider } from "../src/llm/provider.js";

function fakeProvider(): LlmProvider & { embed: ReturnType<typeof vi.fn> } {
  return {
    embed: vi.fn(async (texts: string[]) => texts.map((text) => [text.length, 1])),
    complete: vi.fn(),
    usage: () => ({ chat: { calls: 0, inputTokens: 0, outputTokens: 0 }, embedding: { calls: 0, inputTokens: 0, outputTokens: 0 } }),
  };
}

describe("withEmbeddingCache", () => {
  it("embeds only texts it has not seen, and survives a restart through the cache file", async () => {
    const cacheFile = path.join(await mkdtemp(path.join(tmpdir(), "emb-")), "cache.json");

    const first = fakeProvider();
    const cached = await withEmbeddingCache(first, cacheFile, "model-a");
    await cached.embed(["a", "bb"], "document");
    await cached.embed(["a", "bb", "ccc"], "document");
    expect(first.embed.mock.calls.map(([texts]) => texts)).toEqual([["a", "bb"], ["ccc"]]);

    const afterRestart = fakeProvider();
    const reloaded = await withEmbeddingCache(afterRestart, cacheFile, "model-a");
    expect(await reloaded.embed(["ccc", "a"], "document")).toEqual([[3, 1], [1, 1]]);
    expect(afterRestart.embed).not.toHaveBeenCalled();
  });

  it("ignores a cache file written for another model", async () => {
    const cacheFile = path.join(await mkdtemp(path.join(tmpdir(), "emb-")), "cache.json");
    await (await withEmbeddingCache(fakeProvider(), cacheFile, "model-a")).embed(["a"], "document");

    const other = fakeProvider();
    await (await withEmbeddingCache(other, cacheFile, "model-b")).embed(["a"], "document");
    expect(other.embed).toHaveBeenCalledOnce();
  });
});
