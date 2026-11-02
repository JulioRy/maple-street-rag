import type { ChatMessage, LlmProvider } from "../llm/provider.js";

const REWRITE_SYSTEM_PROMPT = `You rewrite a customer's latest message to a hardware store into a standalone search query.
Resolve pronouns and references ("it", "that one", "and the other?") using the conversation.
Keep product names, numbers and dates exactly. Do not answer the question.
If the latest message is already standalone, return it unchanged.
Reply with the query only, on one line.`;

/**
 * Follow-ups like "How much is the deposit on it?" retrieve nothing useful on their own.
 * With history, an LLM turns them into "carpet cleaner rental deposit". Without history, no extra call.
 */
export async function rewriteQuery(provider: LlmProvider, history: ChatMessage[], message: string): Promise<string> {
  if (history.length === 0) return message;

  const conversation = history.map((m) => `${m.role === "user" ? "Customer" : "Assistant"}: ${m.content}`).join("\n");
  try {
    const rewritten = await provider.complete({
      system: REWRITE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Conversation:\n${conversation}\n\nLatest message: ${message}` }],
    });
    const query = rewritten.trim().split("\n")[0]?.trim();
    return query || fallbackQuery(history, message);
  } catch (error) {
    console.warn(`Query rewrite failed, using recent customer messages instead: ${error instanceof Error ? error.message : error}`);
    return fallbackQuery(history, message);
  }
}

/** Without the LLM: the previous customer message plus the new one keeps the topic in the query. */
function fallbackQuery(history: ChatMessage[], message: string): string {
  const previousUserMessages = history.filter((m) => m.role === "user").slice(-1).map((m) => m.content);
  return [...previousUserMessages, message].join(" ");
}
