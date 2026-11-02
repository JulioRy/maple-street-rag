import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  GEMINI_API_KEY: z
    .string()
    .min(1, "GEMINI_API_KEY is missing: copy .env.example to .env and set your key")
    .refine((key) => key !== "your-gemini-api-key-here", "GEMINI_API_KEY still has the placeholder value from .env.example"),
  PORT: z.coerce.number().int().positive().default(3000),
  CHAT_MODEL: z.string().default("gemini-3.5-flash"),
  EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  RETRIEVAL_K: z.coerce.number().int().positive().default(8),
  DOCS_DIR: z.string().default("docs"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid configuration:\n${problems.join("\n")}`);
  }
  return parsed.data;
}
