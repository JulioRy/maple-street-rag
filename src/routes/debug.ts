import { Router } from "express";
import { z } from "zod";
import type { ScoredChunk } from "../types.js";

const retrieveQuerySchema = z.object({
  q: z.string().trim().min(1, "q must not be empty"),
  k: z.coerce.number().int().min(1).max(50).default(5),
});

export function debugRouter(retrieve: (query: string, k: number) => Promise<ScoredChunk[]>): Router {
  const router = Router();

  router.get("/debug/retrieve", async (req, res) => {
    const parsed = retrieveQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
      return;
    }

    const results = await retrieve(parsed.data.q, parsed.data.k);
    res.json({
      query: parsed.data.q,
      results: results.map(({ chunk, score }) => ({
        chunkId: chunk.chunkId,
        file: chunk.file,
        score,
        text: chunk.text,
      })),
    });
  });

  return router;
}
