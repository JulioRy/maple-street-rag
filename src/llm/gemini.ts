import { GoogleGenAI } from "@google/genai";
import { ModelError } from "../errors.js";
import { callWithRetry } from "./callWithRetry.js";
import type { LlmProvider, ProviderOptions } from "./provider.js";
import { createUsageCounter } from "./usage.js";

/** Gemini accepts up to 100 texts per embedding request. */
const EMBED_BATCH_SIZE = 100;

export function createGeminiProvider(options: ProviderOptions): LlmProvider {
  const client = new GoogleGenAI({ apiKey: options.apiKey });
  const usage = createUsageCounter();

  async function embedBatch(texts: string[], kind: "document" | "query"): Promise<number[][]> {
    const response = await callWithRetry(options.timeoutMs, (abortSignal) =>
      client.models.embedContent({
        model: options.embeddingModel,
        contents: texts,
        config: { abortSignal, taskType: kind === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY" },
      }),
    );
    // The Gemini embedding API does not report tokens; ~4 characters per token is the usual estimate.
    usage.addEmbedding(Math.ceil(texts.join("").length / 4));

    const vectors = response.embeddings?.map((embedding) => embedding.values ?? []) ?? [];
    if (vectors.length !== texts.length || vectors.some((vector) => vector.length === 0)) {
      throw new ModelError(`expected ${texts.length} embeddings, got ${vectors.length}`);
    }
    return vectors;
  }

  return {
    async embed(texts, kind) {
      const vectors: number[][] = [];
      for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
        vectors.push(...(await embedBatch(texts.slice(start, start + EMBED_BATCH_SIZE), kind)));
      }
      return vectors;
    },

    async complete({ system, messages, json }) {
      const response = await callWithRetry(options.timeoutMs, (abortSignal) =>
        client.models.generateContent({
          model: options.chatModel,
          contents: messages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          config: {
            abortSignal,
            systemInstruction: system,
            temperature: 0,
            ...(json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      );
      usage.addChat(response.usageMetadata?.promptTokenCount ?? 0, response.usageMetadata?.candidatesTokenCount ?? 0);

      const text = response.text;
      if (!text) throw new ModelError("empty response");
      return text;
    },

    usage: usage.snapshot,
  };
}
