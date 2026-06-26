import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { extractJson, makeLlm } from '../src/llm';

describe('extractJson', () => {
  it('pulls JSON out of ```json fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it('pulls JSON out of bare fences', () => {
    expect(extractJson('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it('strips surrounding prose', () => {
    expect(extractJson('Here you go: {"a":1} cheers')).toBe('{"a":1}');
  });
  it('returns trimmed input when no braces', () => {
    expect(extractJson('  nope  ')).toBe('nope');
  });
});

describe('makeLlm mock provider', () => {
  it('returns the validated mock without any network call', async () => {
    const llm = makeLlm({ provider: 'mock', baseUrl: 'x', apiKey: 'x', model: 'x', timeoutMs: 1, maxTokens: 1 });
    const schema = z.object({ n: z.number() });
    await expect(llm.json({ system: 's', user: 'u' }, schema, { n: 42 })).resolves.toEqual({ n: 42 });
  });

  it('rejects when the mock itself does not match the schema', async () => {
    const llm = makeLlm({ provider: 'mock', baseUrl: 'x', apiKey: 'x', model: 'x', timeoutMs: 1, maxTokens: 1 });
    const schema = z.object({ n: z.number() });
    // @ts-expect-error intentionally wrong mock shape
    await expect(llm.json({ system: 's', user: 'u' }, schema, { n: 'no' })).rejects.toBeTruthy();
  });

  it('counts every mock call as a success (dry-run must never trip the guard)', async () => {
    const llm = makeLlm({ provider: 'mock', baseUrl: 'x', apiKey: 'x', model: 'x', timeoutMs: 1, maxTokens: 1 });
    const schema = z.object({ n: z.number() });
    expect(llm.successCount()).toBe(0);
    await llm.json({ system: 's', user: 'u' }, schema, { n: 1 });
    await llm.json({ system: 's', user: 'u' }, schema, { n: 2 });
    expect(llm.successCount()).toBe(3 - 1); // two successful calls
  });
});

// --- mid-run-death guard: the live provider's success counter ----------------
// successCount() must increment ONLY on a real validated endpoint response and
// stay flat when json() degrades to the mock fallback (endpoint down/garbage).
describe('makeLlm ollama provider successCount', () => {
  const liveCfg = {
    provider: 'ollama' as const,
    baseUrl: 'http://127.0.0.1:11435/v1',
    apiKey: 'test',
    model: 'm',
    timeoutMs: 1000,
    maxTokens: 50,
  };
  const schema = z.object({ ok: z.boolean() });
  const fallback = { ok: false };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubChatOnce(content: string): void {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }

  it('increments on a real validated response', async () => {
    const llm = makeLlm(liveCfg);
    stubChatOnce('{"ok":true}');
    expect(llm.successCount()).toBe(0);
    const out = await llm.json({ system: 's', user: 'u' }, schema, fallback);
    expect(out).toEqual({ ok: true });
    expect(llm.successCount()).toBe(1);
  });

  it('does NOT increment when the endpoint is unreachable (degrades to fallback)', async () => {
    const llm = makeLlm(liveCfg);
    // Simulate the endpoint dying after a successful ping: every fetch rejects.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const out = await llm.json({ system: 's', user: 'u' }, schema, fallback);
    expect(out).toEqual(fallback); // degraded, not crashed
    expect(llm.successCount()).toBe(0); // <-- the signal the guard relies on
  });

  it('does NOT increment when the model returns unparseable garbage twice', async () => {
    const llm = makeLlm(liveCfg);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'not json at all' } }] }), { status: 200 }),
    );
    const out = await llm.json({ system: 's', user: 'u' }, schema, fallback);
    expect(out).toEqual(fallback);
    expect(llm.successCount()).toBe(0);
  });

  it('keeps a running total across mixed success/failure calls', async () => {
    const llm = makeLlm(liveCfg);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const good = (): Response =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
    // call 1: ok | call 2: dead (both attempts) | call 3: ok
    fetchSpy
      .mockResolvedValueOnce(good())
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(good());
    await llm.json({ system: 's', user: 'u' }, schema, fallback);
    await llm.json({ system: 's', user: 'u' }, schema, fallback);
    await llm.json({ system: 's', user: 'u' }, schema, fallback);
    expect(llm.successCount()).toBe(2);
  });
});
