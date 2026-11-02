import "dotenv/config";
import { z } from "zod";

const DEFAULT_MODELS = {
  openai: { chat: "gpt-4o-mini", embedding: "text-embedding-3-small" },
  gemini: { chat: "gemini-3.5-flash", embedding: "gemini-embedding-001" },
} as const;

const PLACEHOLDER_KEYS = new Set(["your-openai-api-key-here", "your-gemini-api-key-here"]);

const envSchema = z
  .object({
    LLM_PROVIDER: z.enum(["openai", "gemini"]).default("openai"),
    OPENAI_API_KEY: z.string().trim().optional(),
    GEMINI_API_KEY: z.string().trim().optional(),
    CHAT_MODEL: z.string().trim().optional(),
    EMBEDDING_MODEL: z.string().trim().optional(),
    PORT: z.coerce.number().int().positive().default(3000),
    MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
    RETRIEVAL_K: z.coerce.number().int().positive().default(8),
    DOCS_DIR: z.string().default("docs"),
  })
  .transform((env, ctx) => {
    const keyName = env.LLM_PROVIDER === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY";
    const apiKey = env[keyName];
    if (!apiKey || PLACEHOLDER_KEYS.has(apiKey)) {
      const problem = apiKey ? "still has the placeholder value" : "is missing";
      ctx.addIssue({ code: "custom", path: [keyName], message: `${keyName} ${problem}: copy .env.example to .env and set your key` });
      return z.NEVER;
    }
    const defaults = DEFAULT_MODELS[env.LLM_PROVIDER];
    return {
      ...env,
      apiKey,
      chatModel: env.CHAT_MODEL || defaults.chat,
      embeddingModel: env.EMBEDDING_MODEL || defaults.embedding,
    };
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
