import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { ModelError, ModelTimeoutError } from "../src/errors.js";
import { callWithRetry } from "../src/llm/callWithRetry.js";

function httpError(status: number, message = "error"): Error {
  return Object.assign(new Error(message), { status });
}

describe("callWithRetry", () => {
  it("aborts a request that takes longer than the timeout", async () => {
    const neverResolves = (signal: AbortSignal) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    await expect(callWithRetry(20, neverResolves)).rejects.toBeInstanceOf(ModelTimeoutError);
  });

  it("retries a rate-limited request using the provider's suggested delay", async () => {
    const request = vi.fn().mockRejectedValueOnce(httpError(429, "Please retry in 0.01s")).mockResolvedValueOnce("ok");
    await expect(callWithRetry(1000, request)).resolves.toBe("ok");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("fails fast when the suggested wait means a daily quota is exhausted", async () => {
    const request = vi.fn().mockRejectedValue(httpError(429, '{"retryDelay": "37505s"}'));
    await expect(callWithRetry(1000, request)).rejects.toThrow("quota exceeded (HTTP 429)");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not retry client errors such as a bad API key", async () => {
    const request = vi.fn().mockRejectedValue(httpError(401));
    await expect(callWithRetry(1000, request)).rejects.toBeInstanceOf(ModelError);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("loadConfig", () => {
  it("defaults to OpenAI with its default models", () => {
    const config = loadConfig({ OPENAI_API_KEY: "sk-test" });
    expect(config).toMatchObject({ LLM_PROVIDER: "openai", apiKey: "sk-test", chatModel: "gpt-4o-mini", embeddingModel: "text-embedding-3-small" });
  });

  it("switches provider, key and default models with LLM_PROVIDER", () => {
    const config = loadConfig({ LLM_PROVIDER: "gemini", GEMINI_API_KEY: "g-test", CHAT_MODEL: "gemini-3.5-flash-lite" });
    expect(config).toMatchObject({ apiKey: "g-test", chatModel: "gemini-3.5-flash-lite", embeddingModel: "gemini-embedding-001" });
  });

  it("explains a missing key", () => {
    expect(() => loadConfig({})).toThrow("OPENAI_API_KEY is missing");
  });

  it("explains a key left at the .env.example placeholder", () => {
    expect(() => loadConfig({ OPENAI_API_KEY: "your-openai-api-key-here" })).toThrow("OPENAI_API_KEY still has the placeholder value");
  });
});
