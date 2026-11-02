export type Outcome = "answer" | "not_in_docs" | "decline";

/** A piece of a public document, ready to be searched. Dates are ISO strings (YYYY-MM-DD). */
export interface Chunk {
  file: string;
  chunkId: string;
  title: string;
  effective: string;
  text: string;
  /** Only set for documents that carry a "Valid <date> through <date>" range (sale flyers). */
  validFrom?: string;
  validTo?: string;
}

export interface IndexedChunk extends Chunk {
  embedding: number[];
}

export interface ScoredChunk {
  chunk: Chunk;
  score: number;
}

export interface Source {
  file: string;
  chunkId: string;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
  today: string;
}

export interface ChatResponse {
  answer: string;
  outcome: Outcome;
  sources: Source[];
}

export interface SkippedFile {
  file: string;
  reason: string;
}

export interface IngestReport {
  indexed: string[];
  skipped: SkippedFile[];
  chunks: number;
}
