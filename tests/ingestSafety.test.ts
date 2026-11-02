import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { buildChunks } from "../src/ingest/index.js";
import type { Chunk } from "../src/types.js";

/**
 * Defense in depth: the filter is unit tested, and this test checks the end result.
 * After a real ingest of docs/, nothing from an internal, unlabeled or superseded file may exist in the store.
 */
const NEVER_INDEXED_FILES = [
  "staff-handbook-internal.md",
  "pricing-strategy-internal.md",
  "supplier-contacts.txt",
  "returns-policy-2025.md",
  "old-website-faq.html",
];

const INTERNAL_MARKERS = ["555-0142", "555-0199", "555-0177", "alarm code", "cost plus", "employees only", "staff only"];

describe("ingest safety on the real docs/ folder", () => {
  let chunks: Chunk[];

  beforeAll(async () => {
    chunks = (await buildChunks("docs")).chunks;
  });

  it("indexes something (guards against a test that passes on an empty store)", () => {
    expect(chunks.length).toBeGreaterThan(100);
  });

  it.each(NEVER_INDEXED_FILES)("has no chunk from %s", (file) => {
    expect(chunks.filter((chunk) => chunk.file === file)).toEqual([]);
  });

  it.each(INTERNAL_MARKERS)("has no chunk containing %j", (marker) => {
    expect(chunks.filter((chunk) => chunk.text.toLowerCase().includes(marker))).toEqual([]);
  });

  it("has no line of text that exists only in an internal file", async () => {
    const internalLines = (
      await Promise.all(["staff-handbook-internal.md", "pricing-strategy-internal.md", "supplier-contacts.txt"].map((f) => readFile(`docs/${f}`, "utf8")))
    )
      .flatMap((text) => text.split("\n"))
      .map((line) => line.replace(/^[-*#\s]+/, "").trim())
      // Short lines ("# Staff handbook") could legitimately appear in public text too.
      .filter((line) => line.length > 25);

    const allText = chunks.map((chunk) => chunk.text).join("\n");
    const leaked = internalLines.filter((line) => allText.includes(line));
    expect(leaked).toEqual([]);
  });
});
