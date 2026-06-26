import type { z } from 'zod';
import { log } from './logger';

export interface LlmCall {
  system: string;
  user: string;
}

export interface Llm {
  /**
   * Run a JSON-returning call validated against `schema`. `mock` is returned
   * verbatim (after schema validation) when the provider is 'mock' — keeps
   * --dry-run and unit tests deterministic and offline.
   */
  json<T>(call: LlmCall, schema: z.ZodType<T, z.ZodTypeDef, unknown>, mock: T): Promise<T>;
  /** Cheap reachability check. Lets the orchestrator abort a live run before
   *  writing a misleading empty note when the model endpoint is down. */
  ping(): Promise<boolean>;
  /**
   * Count of `json()` calls that returned a REAL model response (validated from
   * the live endpoint), NOT a degraded fallback to the `mock` default.
   *
   * Mid-run-death guard: `ping()` only proves the endpoint was alive at start.
   * If the endpoint dies afterwards every role degrades to its empty default and
   * a misleading "all clear" note would be written. The orchestrator checks this
   * after the run to tell "nothing real to report" apart from "endpoint died".
   * The mock provider counts every call as a success (offline tests stay green).
   */
  successCount(): number;
}

export interface LlmConfig {
  provider: 'ollama' | 'mock';
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
}

/** Strip ```json fences / surrounding prose and return the first JSON object. Pure. */
export function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1] ?? raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return body.trim();
  return body.slice(start, end + 1);
}

export function makeLlm(cfg: LlmConfig): Llm {
  if (cfg.provider === 'mock') {
    // The mock provider always produces a deterministic, "real" answer, so every
    // call counts as a success — dry-run / unit tests must not trip the guard.
    let mockSuccesses = 0;
    return {
      json: async <T>(_call: LlmCall, schema: z.ZodType<T, z.ZodTypeDef, unknown>, mock: T): Promise<T> => {
        const out = schema.parse(mock);
        mockSuccesses++;
        return out;
      },
      ping: async (): Promise<boolean> => true,
      successCount: (): number => mockSuccesses,
    };
  }

  // Per-instance success counter for the live provider. Incremented ONLY when a
  // call returns a validated response from the real endpoint, never on fallback.
  let successes = 0;
  return {
    successCount: (): number => successes,
    async ping(): Promise<boolean> {
      try {
        const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/models`, {
          headers: { authorization: `Bearer ${cfg.apiKey}` },
          signal: AbortSignal.timeout(10000),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    async json<T>(call: LlmCall, schema: z.ZodType<T, z.ZodTypeDef, unknown>, mock: T): Promise<T> {
      let lastErr = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        const userMsg =
          attempt === 0
            ? call.user
            : `${call.user}\n\nYour previous reply was not valid JSON matching the required shape (${lastErr}). Reply with ONLY a single valid JSON object, no prose, no code fences.`;
        try {
          // chat() is INSIDE the try so network/timeout/HTTP failures also
          // degrade to the fallback instead of throwing out of the nightly run.
          const content = await chat(cfg, call.system, userMsg);
          const out = schema.parse(JSON.parse(extractJson(content)));
          // Count only a fully validated real-endpoint response as a success.
          // The fallback path below intentionally does NOT increment, so the
          // orchestrator can detect "endpoint died after ping" (0 successes).
          successes++;
          return out;
        } catch (e) {
          lastErr = (e instanceof Error ? e.message : String(e)).slice(0, 200);
          log.warn('llm', `attempt ${attempt + 1} failed`, { err: lastErr });
        }
      }
      // Both attempts failed: degrade to the empty/default shape instead of
      // crashing the whole nightly run for one weak or unreachable role response.
      log.error('llm', 'falling back to empty role output after 2 failed attempts');
      return schema.parse(mock);
    },
  };
}

/** One OpenAI-compatible chat-completions call against Ollama. Returns content. */
async function chat(cfg: LlmConfig, system: string, user: string): Promise<string> {
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      max_tokens: cfg.maxTokens,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });
  if (!res.ok) throw new Error(`ollama chat failed: HTTP ${res.status}`);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('ollama returned no content');
  return content;
}
