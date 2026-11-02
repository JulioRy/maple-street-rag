import { ModelError, ModelTimeoutError } from "../errors.js";

const MAX_ATTEMPTS = 3;
/** Longer suggested waits mean a daily quota is exhausted: retrying would only hang the request. */
const MAX_RETRY_WAIT_MS = 30_000;

/**
 * Runs one model request with a hard timeout per attempt (AbortController).
 * Retries only rate limits (429) and transient server errors (5xx); everything else fails fast.
 * Works for any SDK whose errors carry a numeric `status` (both Gemini and OpenAI do).
 */
export async function callWithRetry<T>(timeoutMs: number, request: (abortSignal: AbortSignal) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await request(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new ModelTimeoutError();

      const status = httpStatus(error);
      const retryable = status === 429 || (status !== undefined && status >= 500);
      const waitMs = retryDelayMs(error, attempt);
      if (!retryable || attempt >= MAX_ATTEMPTS || waitMs > MAX_RETRY_WAIT_MS) {
        console.warn(`Model request failed${status ? ` with HTTP ${status}` : ""}: ${failureSummary(error)}`);
        throw new ModelError(status === 429 ? "provider rate limit or quota exceeded (HTTP 429)" : status ? `provider returned HTTP ${status}` : describe(error));
      }
      console.warn(`Model request failed with HTTP ${status} (${failureSummary(error)}), retry ${attempt}/${MAX_ATTEMPTS - 1} in ${waitMs} ms`);
      await sleep(waitMs);
    } finally {
      clearTimeout(timer);
    }
  }
}

function httpStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

/** Uses the provider's hint ("retry in 18.2s", "try again in 20s", "retryDelay": "37505s"), else exponential backoff. */
function retryDelayMs(error: unknown, attempt: number): number {
  const hint = /(?:retry in|try again in|"retryDelay":\s*")\s*([\d.]+)\s*s/i.exec(describe(error));
  if (hint?.[1]) return Math.ceil(Number(hint[1]) * 1000);
  return 1000 * 2 ** attempt;
}

/** For quota errors, names the exhausted quota; otherwise the provider's message, shortened. */
function failureSummary(error: unknown): string {
  const message = describe(error);
  const quotas = [...message.matchAll(/"quotaId":\s*"([^"]+)"[^}]*?"quotaValue":\s*"([^"]+)"/g)].map(([, id, value]) => `${id} = ${value}`);
  if (quotas.length > 0) return `quota exceeded: ${[...new Set(quotas)].join("; ")}`;
  return (/"message":\s*"([^"]+)"/.exec(message)?.[1] ?? message).slice(0, 200);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
