import type { ChatMessage } from "../llm/provider.js";

/** Keep the last 6 turns (a turn is one customer message plus one reply). */
const MAX_MESSAGES_PER_SESSION = 12;
/** Bounds memory: when exceeded, the least recently used session is dropped. */
const MAX_SESSIONS = 1000;

export interface SessionStore {
  history(sessionId: string): ChatMessage[];
  appendTurn(sessionId: string, userMessage: string, assistantMessage: string): void;
}

export function createSessionStore(): SessionStore {
  // A Map keeps insertion order, so re-inserting a session moves it to the "most recent" end.
  const sessions = new Map<string, ChatMessage[]>();

  return {
    history(sessionId) {
      return [...(sessions.get(sessionId) ?? [])];
    },

    appendTurn(sessionId, userMessage, assistantMessage) {
      const messages = [
        ...(sessions.get(sessionId) ?? []),
        { role: "user" as const, content: userMessage },
        { role: "assistant" as const, content: assistantMessage },
      ].slice(-MAX_MESSAGES_PER_SESSION);

      sessions.delete(sessionId);
      sessions.set(sessionId, messages);
      if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value!);
    },
  };
}
