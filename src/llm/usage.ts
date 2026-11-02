import type { TokenUsage } from "./provider.js";

/** Token counters shared by the providers; the eval reads them through GET /debug/usage. */
export function createUsageCounter() {
  const chat: TokenUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  const embedding: TokenUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  return {
    addChat(inputTokens: number, outputTokens: number) {
      chat.calls += 1;
      chat.inputTokens += inputTokens;
      chat.outputTokens += outputTokens;
    },
    addEmbedding(inputTokens: number) {
      embedding.calls += 1;
      embedding.inputTokens += inputTokens;
    },
    snapshot: () => ({ chat: { ...chat }, embedding: { ...embedding } }),
  };
}
