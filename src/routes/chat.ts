import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { isIsoDate, systemToday } from "../dates.js";
import type { ChatRequest, ChatResponse } from "../types.js";

const chatBodySchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  message: z.string({ error: "message must be a string" }).trim().min(1, "message must not be empty"),
  today: z.string().refine(isIsoDate, "today must be a date in YYYY-MM-DD format").optional(),
});

export function chatRouter(answer: (request: ChatRequest) => Promise<ChatResponse>): Router {
  const router = Router();

  router.post("/chat", async (req, res) => {
    const parsed = chatBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      // Invalid input is rejected here, before any model call.
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const { sessionId, message, today } = parsed.data;
    const response = await answer({
      sessionId: sessionId ?? randomUUID(),
      message,
      today: today ?? systemToday(),
    });
    res.json(response);
  });

  return router;
}
