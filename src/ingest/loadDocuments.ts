import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";

export type DocumentFormat = "markdown" | "html" | "pdf" | "txt" | "csv";

/** What we know about a file before reading its content. Body text is never loaded here. */
export interface DocumentMeta {
  file: string;
  filePath: string;
  format: DocumentFormat | undefined;
  /** Where the metadata came from; undefined when the file has none anywhere. */
  metadataSource: "front matter" | "manifest" | undefined;
  title?: string;
  audience?: string;
  effective?: string;
  validFrom?: string;
  validTo?: string;
}

export const MANIFEST_FILE = "manifest.json";

const FORMATS_BY_EXTENSION: Record<string, DocumentFormat> = {
  ".md": "markdown",
  ".markdown": "markdown",
  ".html": "html",
  ".htm": "html",
  ".pdf": "pdf",
  ".txt": "txt",
  ".csv": "csv",
};

// YAML turns `effective: 2026-01-01` into a Date, so accept both and normalize to YYYY-MM-DD.
const dateField = z
  .union([z.string(), z.date()])
  .transform((value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value.trim()))
  .optional();

const metadataSchema = z.object({
  title: z.string().trim().optional(),
  audience: z.string().trim().optional(),
  effective: dateField,
  validFrom: dateField,
  validTo: dateField,
});

type Metadata = z.infer<typeof metadataSchema>;

const manifestSchema = z.object({
  files: z.record(z.string(), z.unknown()),
});

export async function loadDocuments(docsDir: string): Promise<DocumentMeta[]> {
  const manifest = await readManifest(docsDir);
  const entries = await readdir(docsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name !== MANIFEST_FILE && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(files.map((file) => loadDocumentMeta(docsDir, file, manifest)));
}

async function loadDocumentMeta(docsDir: string, file: string, manifest: Map<string, Metadata>): Promise<DocumentMeta> {
  const filePath = path.join(docsDir, file);
  const format = FORMATS_BY_EXTENSION[path.extname(file).toLowerCase()];

  // Front matter wins; the manifest covers files that cannot carry front matter.
  const frontMatter = format === "markdown" ? await readFrontMatter(filePath) : undefined;
  const fromManifest = manifest.get(file);
  const metadata = hasAnyMetadata(frontMatter) ? frontMatter : fromManifest;
  const metadataSource = metadata === undefined ? undefined : metadata === frontMatter ? "front matter" : "manifest";

  return { file, filePath, format, metadataSource, ...metadata };
}

async function readFrontMatter(filePath: string): Promise<Metadata | undefined> {
  try {
    const { data } = matter(await readFile(filePath, "utf8"));
    const parsed = metadataSchema.safeParse(data);
    return parsed.success ? parsed.data : undefined;
  } catch {
    // Broken YAML counts as "no metadata", which the filter treats as internal.
    return undefined;
  }
}

async function readManifest(docsDir: string): Promise<Map<string, Metadata>> {
  let raw: string;
  try {
    raw = await readFile(path.join(docsDir, MANIFEST_FILE), "utf8");
  } catch {
    return new Map();
  }

  const manifest = manifestSchema.parse(JSON.parse(raw));
  const entries = new Map<string, Metadata>();
  for (const [file, value] of Object.entries(manifest.files)) {
    const parsed = metadataSchema.safeParse(value);
    if (parsed.success) entries.set(file, parsed.data);
  }
  return entries;
}

function hasAnyMetadata(metadata: Metadata | undefined): metadata is Metadata {
  return metadata !== undefined && Object.values(metadata).some((value) => value !== undefined);
}
