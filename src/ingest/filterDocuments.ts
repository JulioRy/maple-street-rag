import { isIsoDate } from "../dates.js";
import type { SkippedFile } from "../types.js";
import type { DocumentMeta } from "./loadDocuments.js";

/** A document cleared for indexing: public, complete metadata, latest version of its title. */
export interface PublicDocument extends DocumentMeta {
  format: NonNullable<DocumentMeta["format"]>;
  title: string;
  effective: string;
}

export interface FilterResult {
  allowed: PublicDocument[];
  skipped: SkippedFile[];
}

/** The only audience that may be indexed. An allowlist, so unknown labels default to hidden. */
const PUBLIC_AUDIENCE = "public";

/**
 * Decides, from metadata only, which documents may ever reach the index.
 * This is the main safety guarantee: anything skipped here is never read, embedded or sent to the model.
 */
export function filterDocuments(documents: DocumentMeta[]): FilterResult {
  const skipped: SkippedFile[] = [];
  const candidates: PublicDocument[] = [];

  for (const document of documents) {
    const reason = rejectionReason(document);
    if (reason) skipped.push({ file: document.file, reason });
    else candidates.push(document as PublicDocument);
  }

  const latestByTitle = new Map<string, PublicDocument>();
  for (const document of candidates) {
    const key = titleKey(document.title);
    const current = latestByTitle.get(key);
    if (!current || document.effective > current.effective) latestByTitle.set(key, document);
  }

  const allowed: PublicDocument[] = [];
  for (const document of candidates) {
    const latest = latestByTitle.get(titleKey(document.title))!;
    // Same title, older date: the newer version replaces it entirely (no down-ranking).
    if (document.effective < latest.effective) {
      skipped.push({ file: document.file, reason: `superseded by ${latest.file} (effective ${latest.effective})` });
    } else {
      allowed.push(document);
    }
  }

  return { allowed, skipped };
}

function rejectionReason(document: DocumentMeta): string | undefined {
  if (document.metadataSource === undefined || !document.audience) {
    return "no metadata: unknown audience, treated as internal";
  }
  const audience = document.audience.toLowerCase();
  if (audience === "internal") return "internal audience";
  if (audience !== PUBLIC_AUDIENCE) return "audience not public";
  if (!document.title || !document.effective || !isIsoDate(document.effective)) {
    return "incomplete metadata: public documents need a title and an effective date (YYYY-MM-DD)";
  }
  if (!document.format) return "unsupported file type";
  return undefined;
}

function titleKey(title: string): string {
  return title.trim().toLowerCase();
}
