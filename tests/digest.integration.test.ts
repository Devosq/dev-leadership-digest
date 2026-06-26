import { describe, it, expect, vi, beforeEach } from 'vitest';

// End-to-end mid-run-death guard test for runDigest. Everything external (env
// config, git/filesystem repo scan, the four role calls, and all output sinks)
// is mocked so the test is offline and deterministic and asserts the one
// behaviour that matters: a live run whose LLM endpoint dies AFTER ping() must
// throw and write NO Obsidian note and send NO Telegram.

// --- mocks (hoisted by vitest before the runDigest import below) -------------
vi.mock('../src/config', () => ({
  config: {
    OLLAMA_BASE_URL: 'http://127.0.0.1:11435/v1',
    OLLAMA_API_KEY: 'test',
    OLLAMA_MODEL: 'm',
    LLM_TIMEOUT_MS: 1000,
    LLM_MAX_TOKENS: 50,
    DIGEST_REPOS: [{ name: 'Demo', path: '/tmp/demo', oneLiner: 'x', competitors: [] }],
    TELEGRAM_BOT_TOKEN: 'tok',
    TELEGRAM_CHAT_ID: 'chat',
    OBSIDIAN_VAULT: '/tmp/vault',
    OBSIDIAN_DIGEST_DIR: 'd',
    CONTEXT_CHAR_BUDGET: 1000,
  },
}));

// No real git / filesystem repo read.
vi.mock('../src/repo-context', () => ({
  buildRepoDigest: () => ({ name: 'Demo', oneLiner: 'x', competitors: [], window: 'w', changedFiles: [], text: 'digest' }),
}));

// child_process.execFileSync (git pull --ff-only) must be a no-op.
vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

// The role functions delegate to llm.json; we stub them to return empty defaults
// WITHOUT touching successCount — exactly what happens when every llm.json()
// degrades to its fallback after the endpoint dies.
vi.mock('../src/roles', () => ({
  runPm: async () => ({ missingFeatures: [], backlog: [], mrrIdeas: [] }),
  runCto: async () => ({ techDebt: [], securityRisks: [], scalingRisks: [], bottlenecks: [] }),
  runQa: async () => ({ bugs: [], edgeCases: [], crashRisks: [] }),
  runGrowth: async () => ({ competitorMoves: [], missingVsCompetitors: [], opportunities: [] }),
  runSynth: async () => ({ tomorrowTasks: [], oneLine: '' }),
}));

// Spies + mutable control state declared via vi.hoisted so they exist before the
// hoisted vi.mock factories below reference them.
const h = vi.hoisted(() => ({
  writeObsidianNote: vi.fn(() => '/tmp/vault/d/digest.md'),
  sendTelegram: vi.fn(async () => true),
  saveState: vi.fn(),
  pingResult: { value: true },
  successCountValue: { value: 0 },
}));

vi.mock('../src/output', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/output')>();
  return { ...actual, writeObsidianNote: h.writeObsidianNote, sendTelegram: h.sendTelegram };
});

vi.mock('../src/state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/state')>();
  return { ...actual, loadState: () => ({ repos: {} }), saveState: h.saveState };
});

// Controllable llm: ping() result and successCount() are driven per-test.
vi.mock('../src/llm', () => ({
  makeLlm: () => ({
    json: async (_c: unknown, _s: unknown, mock: unknown) => mock,
    ping: async () => h.pingResult.value,
    successCount: () => h.successCountValue.value,
  }),
}));

import { runDigest } from '../src/digest';

describe('runDigest mid-run-death guard (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.pingResult.value = true;
    h.successCountValue.value = 0;
  });

  it('throws and writes NO note / sends NO telegram when endpoint dies after ping (0 successes)', async () => {
    await expect(runDigest({ dryRun: false, statePath: '/tmp/state.json' })).rejects.toThrow(/0 successful responses/);
    expect(h.writeObsidianNote).not.toHaveBeenCalled();
    expect(h.sendTelegram).not.toHaveBeenCalled();
    expect(h.saveState).not.toHaveBeenCalled(); // repo state must stay unchanged
  });

  it('proceeds to write the note when at least one real response came back', async () => {
    h.successCountValue.value = 1;
    const out = await runDigest({ dryRun: false, statePath: '/tmp/state.json' });
    expect(out.notePath).toBe('/tmp/vault/d/digest.md');
    expect(h.writeObsidianNote).toHaveBeenCalledTimes(1);
    expect(h.saveState).toHaveBeenCalledTimes(1);
  });

  it('still aborts the run up-front if ping() itself fails', async () => {
    h.pingResult.value = false;
    await expect(runDigest({ dryRun: false, statePath: '/tmp/state.json' })).rejects.toThrow(/unreachable/);
    expect(h.writeObsidianNote).not.toHaveBeenCalled();
  });
});
