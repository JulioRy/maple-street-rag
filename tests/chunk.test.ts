import { describe, expect, it } from "vitest";
import { MAX_CHUNK_CHARS, chunkProse, chunkRows, splitBySize, splitIntoSections } from "../src/ingest/chunk.js";
import { cleanPdfText, htmlToText } from "../src/ingest/extractText.js";
import type { PublicDocument } from "../src/ingest/filterDocuments.js";
import { parseValidityRange } from "../src/ingest/validityRange.js";

const document: PublicDocument = {
  file: "returns.md",
  filePath: "docs/returns.md",
  format: "markdown",
  metadataSource: "front matter",
  title: "Return policy",
  audience: "public",
  effective: "2026-03-01",
};

describe("chunkProse", () => {
  it("prefixes every chunk with the title and its section headings", () => {
    const text = "# Return policy\n\nIntro.\n\n## Power tools\n\nOpened power tools: 30 days.\n\n### Defective\n\nExchange within a year.";
    const chunks = chunkProse(document, text);

    expect(chunks.map((c) => c.text)).toEqual([
      "[Return policy]\nIntro.",
      "[Return policy > Power tools]\nOpened power tools: 30 days.",
      "[Return policy > Power tools > Defective]\nExchange within a year.",
    ]);
    expect(chunks.map((c) => c.chunkId)).toEqual(["returns.md#1", "returns.md#2", "returns.md#3"]);
  });

  it("drops a deeper heading when a sibling heading starts", () => {
    const sections = splitIntoSections("## A\n\n### A1\n\none\n\n## B\n\ntwo");
    expect(sections.map((s) => s.headings)).toEqual([["A", "A1"], ["B"]]);
  });

  it("copies the validity range onto every chunk of a flyer", () => {
    const range = { validFrom: "2026-11-02", validTo: "2026-11-15" };
    const chunks = chunkProse(document, "## A\n\none\n\n## B\n\ntwo", range);
    expect(chunks.every((c) => c.validFrom === range.validFrom && c.validTo === range.validTo)).toBe(true);
  });
});

describe("splitBySize", () => {
  it("keeps a short section whole", () => {
    expect(splitBySize("short")).toEqual(["short"]);
  });

  it("splits a long section at paragraph boundaries under the cap", () => {
    const paragraph = "x".repeat(300);
    const pieces = splitBySize([paragraph, paragraph, paragraph, paragraph].join("\n\n"));
    expect(pieces).toHaveLength(2);
    expect(pieces.every((p) => p.length <= MAX_CHUNK_CHARS)).toBe(true);
  });

  it("repeats a table header on every piece of a long table", () => {
    const rows = Array.from({ length: 40 }, (_, i) => `| Item ${i} | $${i}.99 |`);
    const table = ["| Item | Price |", "|---|---|", ...rows].join("\n");
    const pieces = splitBySize(table);

    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((p) => p.startsWith("| Item | Price |\n|---|---|\n| Item"))).toBe(true);
    expect(pieces.join("\n")).toContain("| Item 39 | $39.99 |");
  });
});

describe("chunkRows", () => {
  it("makes one self-describing chunk per CSV row, repeating the headers", () => {
    const chunks = chunkRows({ ...document, file: "price-list.csv", title: "Price list", format: "csv" }, [
      { sku: "DR-20B", name: "Cordless Drill 20V Brushless Kit", price_usd: "149.00", aisle: "1" },
      { sku: "SC-1", name: "Drywall Screws", price_usd: "8.99", aisle: "" },
    ]);

    expect(chunks.map((c) => c.text)).toEqual([
      "[Price list] sku: DR-20B | name: Cordless Drill 20V Brushless Kit | price_usd: 149.00 | aisle: 1",
      "[Price list] sku: SC-1 | name: Drywall Screws | price_usd: 8.99",
    ]);
    expect(chunks[1]?.chunkId).toBe("price-list.csv#2");
  });
});

describe("text extraction", () => {
  it("strips navigation, footer and scripts from HTML and keeps headings", () => {
    const html = `<html><body><nav>Home | FAQ</nav><h2>Do you deliver?</h2><p>Yes,   within
      10 miles.</p><footer>(c) 2024</footer><script>var x = 1;</script></body></html>`;
    expect(htmlToText(html)).toBe("## Do you deliver?\n\nYes, within 10 miles.");
  });

  it("removes PDF page markers and hyphenation, and turns numbered titles into headings", () => {
    const pdf = "Intro line\n1. Who can apply\nBring a busi-\nness license.\nWhat\tDiscount\n\n-- 1 of 1 --";
    expect(cleanPdfText(pdf)).toBe("Intro line\n\n## 1. Who can apply\n\nBring a business license.\nWhat | Discount");
  });
});

describe("parseValidityRange", () => {
  it.each([
    ["**Valid Monday, November 2 through Sunday, November 15, 2026.**", "2026-11-02", "2026-11-15"],
    ["Valid Friday, October 9 through Monday, October 12, 2026.", "2026-10-09", "2026-10-12"],
    ["Valid from March 3 to March 9, 2027", "2027-03-03", "2027-03-09"],
    ["valid December 28 - January 3, 2027", "2026-12-28", "2027-01-03"],
  ])("parses %j", (text, validFrom, validTo) => {
    expect(parseValidityRange(text)).toEqual({ validFrom, validTo });
  });

  it("returns undefined when there is no sale period", () => {
    expect(parseValidityRange("Valid photo ID is required.")).toBeUndefined();
  });
});
