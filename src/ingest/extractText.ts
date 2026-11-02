import { readFile } from "node:fs/promises";
import * as cheerio from "cheerio";
import { parse as parseCsv } from "csv-parse/sync";
import matter from "gray-matter";
import { PDFParse } from "pdf-parse";
import type { PublicDocument } from "./filterDocuments.js";

/**
 * Prose comes out as Markdown-like text (headings marked with #) so one chunker handles every format.
 * Tables (CSV) come out as rows, because each row becomes its own chunk.
 */
export type ExtractedContent = { kind: "prose"; text: string } | { kind: "rows"; rows: Record<string, string>[] };

export async function extractText(document: PublicDocument): Promise<ExtractedContent> {
  switch (document.format) {
    case "markdown":
      return { kind: "prose", text: matter(await readFile(document.filePath, "utf8")).content };
    case "html":
      return { kind: "prose", text: htmlToText(await readFile(document.filePath, "utf8")) };
    case "pdf":
      return { kind: "prose", text: cleanPdfText(await readPdf(document.filePath)) };
    case "txt":
      return { kind: "prose", text: await readFile(document.filePath, "utf8") };
    case "csv":
      return { kind: "rows", rows: parseCsvRows(await readFile(document.filePath, "utf8")) };
  }
}

const HTML_NOISE = "script, style, nav, header, footer, noscript";
const HTML_BLOCKS = "p, li, div, tr, br, section, article, table";

export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $(HTML_NOISE).remove();

  // In HTML, a line break in the source is just a space. Real breaks are added below, per block element.
  $("*")
    .contents()
    .each((_, node) => {
      if (node.type === "text") node.data = node.data.replace(/\s+/g, " ");
    });

  // Keep the heading structure so the chunker can split by section.
  $("h1, h2, h3, h4, h5, h6").each((_, element) => {
    const level = Number(element.tagName.slice(1));
    $(element).replaceWith(`\n\n${"#".repeat(level)} ${$(element).text().trim()}\n\n`);
  });
  $(HTML_BLOCKS).each((_, element) => {
    $(element).append("\n");
  });

  const root = $("main").length > 0 ? $("main") : $("body");
  return collapseWhitespace(root.text());
}

async function readPdf(filePath: string): Promise<string> {
  const parser = new PDFParse({ data: await readFile(filePath) });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

/** Removes page markers and hyphenation, and turns numbered section titles ("2. Billing") into headings. */
export function cleanPdfText(text: string): string {
  const cleaned = text
    .replace(/^-- \d+ of \d+ --$/gm, "")
    .replace(/(\w)-\n(\w)/g, "$1$2")
    .replace(/\t+/g, " | ")
    .replace(/^(\d{1,2}\.\s+[A-Z][^.\n]{0,60})$/gm, "\n## $1\n");
  return collapseWhitespace(cleaned);
}

function parseCsvRows(csv: string): Record<string, string>[] {
  return parseCsv(csv, { columns: true, skip_empty_lines: true, trim: true, bom: true });
}

/** Collapses runs of spaces inside lines and keeps at most one blank line between paragraphs. */
function collapseWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
