import { ApiError, GoogleGenAI } from "@google/genai";
import { ModelError, ModelTimeoutError } from "../errors.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  /** Ask the model for a JSON object instead of free text. */
  json?: boolean;
}

export interface TokenUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

/** The only surface the rest of the app uses. Swap the implementation to change provider. */
export interface LlmProvider {
  /** "document" when indexing chunks, "query" when embedding a search query. */
  embed(texts: string[], kind: "document" | "query"): Promise<number[][]>;
  complete(request: CompletionRequest): Promise<string>;
  usage(): { chat: TokenUsage; embedding: TokenUsage };
}

export interface GeminiOptions {
  apiKey: string;
  chatModel: string;
  embeddingModel: string;
  timeoutMs: number;
}

const MAX_ATTEMPTS = 3;
const MAX_RATE_LIMIT_WAIT_MS = 30_000;
const EMBED_BATCH_SIZE = 100;

export function createGeminiProvider(options: GeminiOptions): LlmProvider {
  const client = new GoogleGenAI({ apiKey: options.apiKey });
  const chatUsage: TokenUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  const embeddingUsage: TokenUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };

  async function embedBatch(texts: string[], kind: "document" | "query"): Promise<number[][]> {
    const response = await callWithRetry(options.timeoutMs, (abortSignal) =>
      client.models.embedContent({
        model: options.embeddingModel,
        contents: texts,
        config: { abortSignal, taskType: kind === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY" },
      }),
    );
    embeddingUsage.calls += 1;
    // The embedding API does not report tokens; ~4 characters per token is the usual estimate.
    embeddingUsage.inputTokens += Math.ceil(texts.join("").length / 4);

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
      chatUsage.calls += 1;
      chatUsage.inputTokens += response.usageMetadata?.promptTokenCount ?? 0;
      chatUsage.outputTokens += response.usageMetadata?.candidatesTokenCount ?? 0;

      const text = response.text;
      if (!text) throw new ModelError("empty response");
      return text;
    },

    usage() {
      return { chat: { ...chatUsage }, embedding: { ...embeddingUsage } };
    },
  };
}

/**
 * Runs one model request with a hard timeout per attempt.
 * Retries only on rate limits (HTTP 429) and transient server errors (5xx); everything else fails fast.
 */
async function callWithRetry<T>(timeoutMs: number, request: (abortSignal: AbortSignal) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await request(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new ModelTimeoutError();

      const status = error instanceof ApiError ? error.status : undefined;
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (!retryable || attempt >= MAX_ATTEMPTS) {
        throw new ModelError(status ? `provider returned HTTP ${status}` : describe(error));
      }
      const waitMs = Math.min(retryDelayMs(error, attempt), MAX_RATE_LIMIT_WAIT_MS);
      console.warn(
        `Model request failed with HTTP ${status}, retry ${attempt}/${MAX_ATTEMPTS - 1} in ${waitMs} ms: ${describe(error).slice(0, 300)}`,
      );
      await sleep(waitMs);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Uses the "retry in Ns" hint that Gemini puts in 429 messages, or exponential backoff. */
function retryDelayMs(error: unknown, attempt: number): number {
  const hint = /retry in ([\d.]+)s/i.exec(describe(error));
  if (hint?.[1]) return Math.ceil(Number(hint[1]) * 1000);
  return 1000 * 2 ** attempt;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
