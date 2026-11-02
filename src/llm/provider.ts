import type { Config } from "../config.js";
import { createGeminiProvider } from "./gemini.js";
import { createOpenAiProvider } from "./openai.js";

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

/** The only surface the rest of the app uses. Each provider lives in its own file. */
export interface LlmProvider {
  /** "document" when indexing chunks, "query" when embedding a search query. */
  embed(texts: string[], kind: "document" | "query"): Promise<number[][]>;
  complete(request: CompletionRequest): Promise<string>;
  usage(): { chat: TokenUsage; embedding: TokenUsage };
}

export interface ProviderOptions {
  apiKey: string;
  chatModel: string;
  embeddingModel: string;
  timeoutMs: number;
}

export function createProvider(config: Config): LlmProvider {
  const options: ProviderOptions = {
    apiKey: config.apiKey,
    chatModel: config.chatModel,
    embeddingModel: config.embeddingModel,
    timeoutMs: config.MODEL_TIMEOUT_MS,
  };
  return config.LLM_PROVIDER === "gemini" ? createGeminiProvider(options) : createOpenAiProvider(options);
}
