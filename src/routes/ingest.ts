import { Router } from "express";
import type { IngestReport } from "../types.js";

export function ingestRouter(runIngest: () => Promise<IngestReport>): Router {
  const router = Router();

  router.post("/ingest", async (_req, res) => {
    res.json(await runIngest());
  });

  return router;
}
