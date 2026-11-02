import express, { type ErrorRequestHandler } from "express";
import { HttpError } from "./errors.js";
import { chatRouter } from "./routes/chat.js";
import { debugRouter } from "./routes/debug.js";
import { ingestRouter } from "./routes/ingest.js";
import type { ChatRequest, ChatResponse, IngestReport, ScoredChunk } from "./types.js";

/** Everything the HTTP layer needs. Injected so tests can use fakes instead of a real model. */
export interface AppServices {
  answer(request: ChatRequest): Promise<ChatResponse>;
  runIngest(): Promise<IngestReport>;
  retrieve(query: string, k: number): Promise<ScoredChunk[]>;
  usage(): unknown;
}

export function createApp(services: AppServices): express.Express {
  const app = express();
  app.use(express.json({ limit: "100kb" }));

  app.use(chatRouter((request) => services.answer(request)));
  app.use(ingestRouter(() => services.runIngest()));
  app.use(
    debugRouter(
      (query, k) => services.retrieve(query, k),
      () => services.usage(),
    ),
  );

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(errorHandler);
  return app;
}

/** Single place where errors become HTTP responses. The server never crashes on a bad request. */
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  // Malformed JSON body, raised by express.json().
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Request body is not valid JSON" });
    return;
  }
  console.error("Unexpected error:", error);
  res.status(500).json({ error: "Internal server error" });
};
