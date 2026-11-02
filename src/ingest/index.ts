import type { Chunk, IngestReport, SkippedFile } from "../types.js";
import { chunkProse, chunkRows } from "./chunk.js";
import { extractText } from "./extractText.js";
import { filterDocuments, type PublicDocument } from "./filterDocuments.js";
import { loadDocuments } from "./loadDocuments.js";
import { parseValidityRange } from "./validityRange.js";

export interface BuiltChunks {
  chunks: Chunk[];
  report: IngestReport;
}

/**
 * load metadata -> filter -> extract text -> chunk. No model calls, so it is fully testable.
 * Only documents that passed the filter are ever opened past their metadata.
 */
export async function buildChunks(docsDir: string): Promise<BuiltChunks> {
  const { allowed, skipped } = filterDocuments(await loadDocuments(docsDir));

  const chunks: Chunk[] = [];
  const indexed: string[] = [];
  const extractionFailures: SkippedFile[] = [];

  for (const document of allowed) {
    try {
      const documentChunks = await chunkDocument(document);
      if (documentChunks.length === 0) {
        extractionFailures.push({ file: document.file, reason: "no text found" });
        continue;
      }
      chunks.push(...documentChunks);
      indexed.push(document.file);
    } catch (error) {
      // One broken file must not stop the others from being indexed.
      const message = error instanceof Error ? error.message : String(error);
      extractionFailures.push({ file: document.file, reason: `could not extract text: ${message}` });
    }
  }

  return { chunks, report: { indexed, skipped: [...skipped, ...extractionFailures], chunks: chunks.length } };
}

async function chunkDocument(document: PublicDocument): Promise<Chunk[]> {
  const content = await extractText(document);
  if (content.kind === "rows") return chunkRows(document, content.rows);

  // Explicit metadata wins; otherwise look for a "Valid <date> through <date>" line (sale flyers).
  const range =
    document.validFrom && document.validTo
      ? { validFrom: document.validFrom, validTo: document.validTo }
      : parseValidityRange(content.text);
  return chunkProse(document, content.text, range);
}
