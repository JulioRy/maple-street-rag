import type { Chunk } from "../types.js";
import type { PublicDocument } from "./filterDocuments.js";

/** Sections longer than this are split by paragraph, then by line. */
export const MAX_CHUNK_CHARS = 800;

interface Section {
  headings: string[];
  body: string;
}

type ChunkBase = Omit<Chunk, "chunkId" | "text">;

export function chunkProse(document: PublicDocument, text: string, range?: { validFrom: string; validTo: string }): Chunk[] {
  const base: ChunkBase = { file: document.file, title: document.title, effective: document.effective, ...range };
  const pieces = splitIntoSections(text).flatMap((section) =>
    splitBySize(section.body).map((body) => `[${[document.title, ...section.headings].join(" > ")}]\n${body}`),
  );
  return pieces.map((piece, index) => ({ ...base, chunkId: `${document.file}#${index + 1}`, text: piece }));
}

/** One chunk per row, written as "header: value" pairs so every chunk explains itself. */
export function chunkRows(document: PublicDocument, rows: Record<string, string>[]): Chunk[] {
  const base: ChunkBase = { file: document.file, title: document.title, effective: document.effective };
  return rows.map((row, index) => {
    const fields = Object.entries(row)
      .filter(([, value]) => value !== "")
      .map(([header, value]) => `${header}: ${value}`)
      .join(" | ");
    return { ...base, chunkId: `${document.file}#${index + 1}`, text: `[${document.title}] ${fields}` };
  });
}

/**
 * Splits Markdown-like text at headings. The top-level (#) heading is skipped in the breadcrumb
 * because it repeats the document title; deeper headings are kept ("Return policy > Power tools").
 */
export function splitIntoSections(text: string): Section[] {
  const sections: Section[] = [];
  let headingStack: { level: number; text: string }[] = [];
  let lines: string[] = [];

  const flush = () => {
    const body = lines.join("\n").trim();
    if (body) sections.push({ headings: headingStack.filter((h) => h.level > 1).map((h) => h.text), body });
    lines = [];
  };

  for (const line of text.split("\n")) {
    const heading = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1]!.length;
      headingStack = [...headingStack.filter((h) => h.level < level), { level, text: heading[2]! }];
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

/** Packs paragraphs into pieces of at most MAX_CHUNK_CHARS; an oversized paragraph is packed line by line. */
export function splitBySize(body: string, maxChars = MAX_CHUNK_CHARS): string[] {
  if (body.length <= maxChars) return [body];

  const units = body
    .split(/\n\s*\n/)
    .flatMap((paragraph) => (paragraph.length <= maxChars ? [paragraph] : splitLongParagraph(paragraph, maxChars)));

  const pieces: string[] = [];
  let current = "";
  for (const unit of units) {
    if (current && current.length + unit.length + 2 > maxChars) {
      pieces.push(current);
      current = unit;
    } else {
      current = current ? `${current}\n\n${unit}` : unit;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/**
 * Splits by line. A Markdown table keeps its header row on every piece, so a row is never
 * separated from its column names. Lines longer than the cap are kept whole (rare in these docs).
 */
function splitLongParagraph(paragraph: string, maxChars: number): string[] {
  const lines = paragraph.split("\n");
  const isTable = lines.length > 2 && lines[0]!.startsWith("|") && /^\|[\s|:-]+\|$/.test(lines[1]!);
  const header = isTable ? `${lines[0]}\n${lines[1]}` : "";
  const bodyLines = isTable ? lines.slice(2) : lines;

  const pieces: string[] = [];
  let current = header;
  for (const line of bodyLines) {
    if (current !== header && current.length + line.length + 1 > maxChars) {
      pieces.push(current);
      current = header;
    }
    current = current ? `${current}\n${line}` : line;
  }
  if (current !== header) pieces.push(current);
  return pieces;
}
