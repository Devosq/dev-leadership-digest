import 'dotenv/config';
import { z } from 'zod';

const RepoSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  oneLiner: z.string().default(''),
  competitors: z.array(z.string()).default([]),
});
export type RepoConfig = z.infer<typeof RepoSchema>;

const jsonRepos = z.string().transform((s, ctx) => {
  try {
    return z.array(RepoSchema).parse(JSON.parse(s));
  } catch (e) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `DIGEST_REPOS is not valid JSON: ${(e as Error).message}` });
    return z.NEVER;
  }
});

const EnvSchema = z.object({
  OLLAMA_BASE_URL: z.string().url().default('http://127.0.0.1:11435/v1'),
  OLLAMA_API_KEY: z.string().default('ollama'),
  OLLAMA_MODEL: z.string().default('qwen2.5-coder:14b'),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  LLM_MAX_TOKENS: z.coerce.number().int().positive().default(2000),

  DIGEST_REPOS: jsonRepos.default('[]'),

  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_CHAT_ID: z.string().default(''),

  OBSIDIAN_VAULT: z.string().default(''),
  OBSIDIAN_DIGEST_DIR: z.string().default('Strategia/dev-digest'),

  CONTEXT_CHAR_BUDGET: z.coerce.number().int().positive().default(48000),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
