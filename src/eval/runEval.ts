import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { checkCase, type CaseExpectation, type ServerReply } from "./checkCase.js";

interface EvalCase {
  id: string;
  category: string;
  today?: string;
  turns: string[];
  expect: CaseExpectation;
}

interface CaseResult {
  id: string;
  category: string;
  passed: boolean;
  failures: string[];
  note?: string;
  status: number;
  answer?: string;
  outcome?: string;
  sources?: ServerReply["body"]["sources"];
  error?: string;
  durationMs: number;
}

const BASE_URL = process.env.EVAL_BASE_URL ?? "http://localhost:3000";
// Small, so a run stays well inside provider rate limits.
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 4);
const REQUEST_TIMEOUT_MS = 180_000;
const CASES_FILE = "cases.json";
const RESULTS_FILE = "eval-results.json";

async function main(): Promise<void> {
  const { cases } = JSON.parse(await readFile(CASES_FILE, "utf8")) as { cases: EvalCase[] };
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const only = args.find((arg) => !arg.startsWith("--"))?.split(",");
  const selected = only ? cases.filter((c) => only.includes(c.id) || only.includes(c.category)) : cases;

  console.log(`Running ${selected.length} cases against ${BASE_URL} (concurrency ${CONCURRENCY})\n`);
  const usageBefore = await fetchUsage();
  const startedAt = Date.now();

  const results = await mapWithConcurrency(selected, CONCURRENCY, async (evalCase) => {
    const result = await runCase(evalCase);
    printResult(result);
    if (verbose) printConversation(evalCase, result);
    return result;
  });

  const usageAfter = await fetchUsage();
  const passed = results.filter((r) => r.passed).length;
  const tokens = tokenDelta(usageBefore, usageAfter);

  console.log(`\n${passed}/${results.length} passed in ${Math.round((Date.now() - startedAt) / 1000)}s\n`);
  printCategoryBreakdown(results);
  if (tokens) {
    console.log(`\nTokens: chat ${tokens.chatCalls} calls, ${tokens.inputTokens} in / ${tokens.outputTokens} out; ${tokens.embeddingCalls} embedding calls`);
  }

  await writeFile(
    RESULTS_FILE,
    JSON.stringify({ baseUrl: BASE_URL, runAt: new Date().toISOString(), passed, total: results.length, tokens, results }, null, 2),
  );
  console.log(`Details written to ${RESULTS_FILE}`);
}

/** One conversation: turns sent in order with a fresh session; only the last reply is checked. */
async function runCase(evalCase: EvalCase): Promise<CaseResult> {
  const sessionId = `eval-${evalCase.id}-${randomUUID()}`;
  const started = Date.now();
  let reply: ServerReply | undefined;

  try {
    for (const message of evalCase.turns) {
      reply = await postChat({ sessionId, message, ...(evalCase.today ? { today: evalCase.today } : {}) });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...baseResult(evalCase, started), passed: false, failures: [`network error: ${message}`], status: 0, error: message };
  }

  const lastMessage = evalCase.turns.at(-1) ?? "";
  const failures = checkCase(evalCase.expect, reply!, lastMessage.trim() === "");
  return {
    ...baseResult(evalCase, started),
    passed: failures.length === 0,
    failures,
    status: reply!.status,
    answer: reply!.body.answer,
    outcome: reply!.body.outcome,
    sources: reply!.body.sources,
    error: reply!.body.error,
  };
}

function baseResult(evalCase: EvalCase, started: number) {
  return { id: evalCase.id, category: evalCase.category, note: evalCase.expect.note, durationMs: Date.now() - started };
}

async function postChat(body: object): Promise<ServerReply> {
  const response = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: { error: `non-JSON response: ${text.slice(0, 200)}` } };
  }
}

function printResult(result: CaseResult): void {
  if (result.passed) {
    console.log(`PASS ${result.id}`);
    return;
  }
  console.log(`FAIL ${result.id}: ${result.failures.join("; ")}`);
  if (result.note) console.log(`     note: ${result.note}`);
  if (result.answer) console.log(`     answer: ${result.answer.replace(/\s+/g, " ").slice(0, 300)}`);
}

/** --verbose: every turn the customer sent, then the reply that was checked. */
function printConversation(evalCase: EvalCase, result: CaseResult): void {
  for (const turn of evalCase.turns) console.log(`     Q: ${turn || "(empty message)"}`);
  if (result.passed || !result.answer) console.log(`     A: ${(result.answer ?? `HTTP ${result.status}: ${result.error}`).replace(/\s+/g, " ")}`);
  console.log("");
}

function printCategoryBreakdown(results: CaseResult[]): void {
  const byCategory = new Map<string, { passed: number; total: number }>();
  for (const result of results) {
    const entry = byCategory.get(result.category) ?? { passed: 0, total: 0 };
    entry.total += 1;
    if (result.passed) entry.passed += 1;
    byCategory.set(result.category, entry);
  }
  console.log("By category:");
  for (const [category, { passed, total }] of [...byCategory].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${passed === total ? " " : "!"} ${passed}/${total}  ${category}`);
  }
}

interface UsageSnapshot {
  chat: { calls: number; inputTokens: number; outputTokens: number };
  embedding: { calls: number };
}

async function fetchUsage(): Promise<UsageSnapshot | undefined> {
  try {
    const response = await fetch(`${BASE_URL}/debug/usage`, { signal: AbortSignal.timeout(5_000) });
    return response.ok ? ((await response.json()) as UsageSnapshot) : undefined;
  } catch {
    return undefined;
  }
}

function tokenDelta(before: UsageSnapshot | undefined, after: UsageSnapshot | undefined) {
  if (!before || !after) return undefined;
  return {
    chatCalls: after.chat.calls - before.chat.calls,
    inputTokens: after.chat.inputTokens - before.chat.inputTokens,
    outputTokens: after.chat.outputTokens - before.chat.outputTokens,
    embeddingCalls: after.embedding.calls - before.embedding.calls,
  };
}

/** Runs `worker` over `items` with at most `limit` in flight; results keep the input order. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]!);
    }
  });
  await Promise.all(runners);
  return results;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
