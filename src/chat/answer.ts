import { z } from "zod";
import { ModelError } from "../errors.js";
import type { CompletionRequest, LlmProvider } from "../llm/provider.js";
import type { ChatRequest, ChatResponse, ScoredChunk, Source } from "../types.js";
import { buildPrompt } from "./buildPrompt.js";
import { rewriteQuery } from "./rewriteQuery.js";
import type { SessionStore } from "./sessionStore.js";

const modelReplySchema = z.object({
  reasoning: z.string().default(""),
  answer: z.string().trim().min(1),
  outcome: z.enum(["answer", "not_in_docs", "decline"]),
  usedChunkIds: z.array(z.string()).default([]),
});

type ModelReply = z.infer<typeof modelReplySchema>;

export const SAFE_DECLINE_ANSWER =
  "Sorry, I can't share that. I can only help with questions about Maple Street Hardware's products, services and policies.";

export interface ChatDependencies {
  provider: LlmProvider;
  search(query: string, k: number): Promise<ScoredChunk[]>;
  sessions: SessionStore;
  k: number;
}

/** rewrite (follow-ups only) -> retrieve -> prompt -> validated JSON -> code guardrails -> remember the turn. */
export function createChatService(deps: ChatDependencies): (request: ChatRequest) => Promise<ChatResponse> {
  return async ({ sessionId, message, today }) => {
    const history = deps.sessions.history(sessionId);
    const query = await rewriteQuery(deps.provider, history, message);
    const chunks = await deps.search(query, deps.k);

    const reply = await completeWithValidJson(deps.provider, buildPrompt({ today, history, message, chunks }));
    const response = applyGuardrails(reply, chunks);

    deps.sessions.appendTurn(sessionId, message, response.answer);
    return response;
  };
}

/** Asks for JSON; if the reply is not valid JSON in the expected shape, asks once more, then gives up cleanly. */
async function completeWithValidJson(provider: LlmProvider, request: CompletionRequest): Promise<ModelReply> {
  let lastProblem = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await provider.complete(request);
    const parsed = parseModelReply(raw);
    if (parsed.success) return parsed.reply;

    lastProblem = parsed.problem;
    console.warn(`Model reply rejected (attempt ${attempt}/2): ${lastProblem}`);
  }
  throw new ModelError(`invalid reply format (${lastProblem})`);
}

export function parseModelReply(raw: string): { success: true; reply: ModelReply } | { success: false; problem: string } {
  // Some models wrap JSON in a Markdown code fence even when asked not to.
  const json = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { success: false, problem: "not valid JSON" };
  }
  const result = modelReplySchema.safeParse(data);
  if (!result.success) return { success: false, problem: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  return { success: true, reply: result.data };
}

/**
 * Deterministic checks on the model's reply:
 * - sources are only chunk IDs that were really retrieved (drops invented IDs, never "all k");
 * - a phone number that appears in no retrieved document cannot have come from the documents, so the
 *   whole answer is replaced by a safe decline (defense in depth against leaks and invented contacts).
 */
export function applyGuardrails(reply: ModelReply, chunks: ScoredChunk[]): ChatResponse {
  const retrievedDigits = chunks.map(({ chunk }) => digitsOnly(chunk.text));
  const unknownPhone = findPhoneNumbers(reply.answer).find(
    (phone) => !retrievedDigits.some((digits) => digits.includes(digitsOnly(phone))),
  );
  if (unknownPhone) {
    console.warn("Answer contained a phone number not present in any retrieved document; replaced with a decline.");
    return { answer: SAFE_DECLINE_ANSWER, outcome: "decline", sources: [] };
  }

  return {
    answer: stripMarkdownEmphasis(reply.answer),
    outcome: reply.outcome,
    sources: reply.outcome === "decline" ? [] : pickSources(reply.usedChunkIds, chunks),
  };
}

function pickSources(usedChunkIds: string[], chunks: ScoredChunk[]): Source[] {
  const retrieved = new Map(chunks.map(({ chunk }) => [chunk.chunkId, chunk]));
  const sources: Source[] = [];
  for (const chunkId of new Set(usedChunkIds)) {
    const chunk = retrieved.get(chunkId);
    if (chunk) sources.push({ file: chunk.file, chunkId });
  }
  return sources;
}

/** The prompt asks for plain text, but models still add **bold** now and then; the customer should not see asterisks. */
function stripMarkdownEmphasis(text: string): string {
  return text.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, bold, underscored) => bold ?? underscored);
}

/** US-style numbers: 555-0142, (555) 010-4120, 555.010.4120, 555 010 4120. */
function findPhoneNumbers(text: string): string[] {
  return text.match(/(?:\(\d{3}\)\s*|\b\d{3}[\s.-])?\b\d{3}[\s.-]\d{4}\b/g) ?? [];
}

function digitsOnly(text: string): string {
  return text.replace(/\D/g, "");
}
