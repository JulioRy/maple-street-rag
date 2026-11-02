import { describe, expect, it } from "vitest";
import { filterDocuments } from "../src/ingest/filterDocuments.js";
import { loadDocuments, type DocumentMeta } from "../src/ingest/loadDocuments.js";

function doc(file: string, overrides: Partial<DocumentMeta> = {}): DocumentMeta {
  return {
    file,
    filePath: `docs/${file}`,
    format: "markdown",
    metadataSource: "front matter",
    title: file,
    audience: "public",
    effective: "2026-01-01",
    ...overrides,
  };
}

function reasonFor(result: ReturnType<typeof filterDocuments>, file: string): string | undefined {
  return result.skipped.find((skipped) => skipped.file === file)?.reason;
}

describe("filterDocuments", () => {
  it("skips internal documents", () => {
    const result = filterDocuments([doc("handbook.md", { audience: "internal" })]);
    expect(result.allowed).toEqual([]);
    expect(reasonFor(result, "handbook.md")).toBe("internal audience");
  });

  it("treats a file with no metadata anywhere as internal", () => {
    const result = filterDocuments([
      doc("contacts.txt", { format: "txt", metadataSource: undefined, title: undefined, audience: undefined, effective: undefined }),
    ]);
    expect(result.allowed).toEqual([]);
    expect(reasonFor(result, "contacts.txt")).toBe("no metadata: unknown audience, treated as internal");
  });

  it("treats metadata without an audience as internal", () => {
    const result = filterDocuments([doc("notes.md", { audience: undefined })]);
    expect(reasonFor(result, "notes.md")).toBe("no metadata: unknown audience, treated as internal");
  });

  it.each(["staff", "confidential", "partners", "Public-ish"])("uses an allowlist: audience %s is skipped", (audience) => {
    const result = filterDocuments([doc("odd.md", { audience })]);
    expect(result.allowed).toEqual([]);
    expect(reasonFor(result, "odd.md")).toBe("audience not public");
  });

  it("accepts public regardless of letter case", () => {
    expect(filterDocuments([doc("faq.md", { audience: "Public" })]).allowed).toHaveLength(1);
  });

  it("skips the older of two documents with the same title", () => {
    const result = filterDocuments([
      doc("returns-2025.md", { title: "Return policy", effective: "2025-01-01" }),
      doc("returns-2026.md", { title: "Return policy", effective: "2026-03-01" }),
    ]);
    expect(result.allowed.map((d) => d.file)).toEqual(["returns-2026.md"]);
    expect(reasonFor(result, "returns-2025.md")).toBe("superseded by returns-2026.md (effective 2026-03-01)");
  });

  it("matches titles across formats and ignores case and surrounding spaces", () => {
    const result = filterDocuments([
      doc("old-faq.html", { format: "html", metadataSource: "manifest", title: " general questions ", effective: "2024-06-01" }),
      doc("general-faq.md", { title: "General questions", effective: "2026-01-01" }),
    ]);
    expect(result.allowed.map((d) => d.file)).toEqual(["general-faq.md"]);
  });

  it("does not let an internal document supersede a public one", () => {
    const result = filterDocuments([
      doc("hours.md", { title: "Store hours", effective: "2026-01-01" }),
      doc("hours-draft.md", { title: "Store hours", effective: "2026-12-01", audience: "internal" }),
    ]);
    expect(result.allowed.map((d) => d.file)).toEqual(["hours.md"]);
  });

  it("skips public documents without a usable effective date", () => {
    const result = filterDocuments([doc("flyer.md", { effective: "next week" })]);
    expect(reasonFor(result, "flyer.md")).toMatch(/^incomplete metadata/);
  });

  it("skips unsupported file types", () => {
    const result = filterDocuments([doc("photo.png", { format: undefined, metadataSource: "manifest" })]);
    expect(reasonFor(result, "photo.png")).toBe("unsupported file type");
  });
});

describe("filterDocuments on the real docs/ folder", () => {
  it("allows only the current public documents and explains every skip", async () => {
    const result = filterDocuments(await loadDocuments("docs"));
    const skipped = Object.fromEntries(result.skipped.map((s) => [s.file, s.reason]));

    expect(skipped).toEqual({
      "pricing-strategy-internal.md": "internal audience",
      "staff-handbook-internal.md": "internal audience",
      "supplier-contacts.txt": "no metadata: unknown audience, treated as internal",
      "returns-policy-2025.md": "superseded by returns-policy-2026.md (effective 2026-03-01)",
      "old-website-faq.html": "superseded by general-faq.md (effective 2026-01-01)",
    });
    expect(result.allowed).toHaveLength(21);
  });

  it("normalizes YAML dates to YYYY-MM-DD", async () => {
    const documents = await loadDocuments("docs");
    const hours = documents.find((d) => d.file === "store-hours.md");
    expect(hours?.effective).toBe("2026-01-01");
  });
});
