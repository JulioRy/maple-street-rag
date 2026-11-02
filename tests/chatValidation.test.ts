import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp, type AppServices } from "../src/app.js";
import { ModelTimeoutError } from "../src/errors.js";

function fakeServices(overrides: Partial<AppServices> = {}): AppServices {
  return {
    answer: vi.fn(async () => ({ answer: "ok", outcome: "answer" as const, sources: [] })),
    runIngest: vi.fn(async () => ({ indexed: [], skipped: [], chunks: 0 })),
    retrieve: vi.fn(async () => []),
    usage: vi.fn(() => ({})),
    ...overrides,
  };
}

describe("POST /chat input validation", () => {
  const invalidBodies: Array<[string, unknown]> = [
    ["empty string", { sessionId: "s", message: "" }],
    ["whitespace only", { sessionId: "s", message: "   \n\t" }],
    ["missing message", { sessionId: "s" }],
    ["message is a number", { sessionId: "s", message: 42 }],
    ["message is null", { sessionId: "s", message: null }],
    ["invalid today", { sessionId: "s", message: "hi", today: "2026-13-40" }],
  ];

  it.each(invalidBodies)("returns 400 without calling the model: %s", async (_label, body) => {
    const services = fakeServices();
    const response = await request(createApp(services)).post("/chat").send(body as object);

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual(expect.any(String));
    expect(services.answer).not.toHaveBeenCalled();
  });

  it("returns 400 for a body that is not valid JSON", async () => {
    const services = fakeServices();
    const response = await request(createApp(services))
      .post("/chat")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(response.status).toBe(400);
    expect(services.answer).not.toHaveBeenCalled();
  });

  it("passes a valid message through, using body.today when given", async () => {
    const services = fakeServices();
    const response = await request(createApp(services))
      .post("/chat")
      .send({ sessionId: "abc", message: "  When do you open?  ", today: "2026-11-05" });

    expect(response.status).toBe(200);
    expect(services.answer).toHaveBeenCalledWith({ sessionId: "abc", message: "When do you open?", today: "2026-11-05" });
  });

  it("maps a model timeout to 504 with a clean error", async () => {
    const services = fakeServices({
      answer: async () => {
        throw new ModelTimeoutError();
      },
    });
    const response = await request(createApp(services)).post("/chat").send({ sessionId: "s", message: "hi" });

    expect(response.status).toBe(504);
    expect(response.body).toEqual({ error: "Model timed out" });
  });
});
