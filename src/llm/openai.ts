import OpenAI from "openai";
import { ModelError } from "../errors.js";
import { callWithRetry } from "./callWithRetry.js";
import type { LlmProvider, ProviderOptions } from "./provider.js";
import { createUsageCounter } from "./usage.js";

/** OpenAI accepts up to 2048 inputs per embedding request; smaller batches keep each request quick. */
const EMBED_BATCH_SIZE = 500;

export function createOpenAiProvider(options: ProviderOptions): LlmProvider {
  // maxRetries: 0 so callWithRetry is the single retry and timeout policy for every provider.
  const client = new OpenAI({ apiKey: options.apiKey, maxRetries: 0 });
  const usage = createUsageCounter();

  async function embedBatch(texts: string[]): Promise<number[][]> {
    const response = await callWithRetry(options.timeoutMs, (signal) =>
      client.embeddings.create({ model: options.embeddingModel, input: texts }, { signal }),
    );
    usage.addEmbedding(response.usage?.prompt_tokens ?? 0);

    // The API returns items with an index; sort to be safe instead of trusting the order.
    const vectors = [...response.data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
    if (vectors.length !== texts.length) throw new ModelError(`expected ${texts.length} embeddings, got ${vectors.length}`);
    return vectors;
  }

  return {
    // OpenAI embeddings have no separate document/query modes, so `kind` is not needed here.
    async embed(texts) {
      const vectors: number[][] = [];
      for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
        vectors.push(...(await embedBatch(texts.slice(start, start + EMBED_BATCH_SIZE))));
      }
      return vectors;
    },

    async complete({ system, messages, json }) {
      const response = await callWithRetry(options.timeoutMs, (signal) =>
        client.chat.completions.create(
          {
            model: options.chatModel,
            temperature: 0,
            messages: [{ role: "system", content: system }, ...messages],
            ...(json ? { response_format: { type: "json_object" as const } } : {}),
          },
          { signal },
        ),
      );
      usage.addChat(response.usage?.prompt_tokens ?? 0, response.usage?.completion_tokens ?? 0);

      const text = response.choices[0]?.message.content;
      if (!text) throw new ModelError("empty response");
      return text;
    },

    usage: usage.snapshot,
  };
}
