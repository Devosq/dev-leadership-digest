import { describe, it, expect } from 'vitest';
import { secretScrub, buildTelegramBrief, buildObsidianNote } from '../src/output';
import type { RepoResult } from '../src/schemas';

const sample: RepoResult = {
  name: 'Addwork',
  pm: { missingFeatures: ['SSO'], backlog: [{ title: 'Add billing export', impact: 'high', effort: 'medium', why: 'unblocks paid' }], mrrIdeas: [] },
  cto: { techDebt: [{ file: 'a.ts', issue: 'god object', severity: 'medium' }], securityRisks: [], scalingRisks: [], bottlenecks: ['n+1 queries'] },
  qa: { bugs: [{ file: 'login.ts', symptom: 'null deref on empty email', severity: 'high' }], edgeCases: ['unicode names'], crashRisks: [] },
  growth: { competitorMoves: [], missingVsCompetitors: ['mobile app'], opportunities: ['SEO'] },
  synth: { tomorrowTasks: [], oneLine: 'Ship billing export, fix login null deref.' },
  newTasks: [{ title: 'Fix login null deref', repo: 'Addwork', role: 'qa', priority: 'high', scopeHint: 'login.ts guard empty email' }],
};

describe('secretScrub', () => {
  it('redacts a telegram bot token', () => {
    expect(secretScrub('token 123456789:AAEStuffStuffStuffStuffStuffStuff12')).toContain('[REDACTED_TG_TOKEN]');
  });
  it('redacts sk- keys and bearer auth', () => {
    expect(secretScrub('key sk-abcdef0123456789abcdef')).toContain('[REDACTED_KEY]');
    expect(secretScrub('Authorization: Bearer abcdef0123456789ABCDEF')).toContain('[REDACTED_AUTH]');
  });
  it('redacts common provider tokens (GitHub PAT, hcloud)', () => {
    expect(secretScrub('ghp_0123456789abcdefABCD')).toContain('[REDACTED_TOKEN]');
    expect(secretScrub('hcloud0123456789ABCDEFGH')).toContain('[REDACTED_TOKEN]');
  });
  it('keeps a 40-char commit SHA readable (not a secret)', () => {
    const sha = 'a'.repeat(40);
    expect(secretScrub(`fix in ${sha}`)).toContain(sha);
  });
  it('leaves ordinary text intact', () => {
    expect(secretScrub('just a normal sentence')).toBe('just a normal sentence');
  });
});

describe('buildTelegramBrief', () => {
  it('includes repo name, a bug, a feature and tomorrow tasks', () => {
    const out = buildTelegramBrief([sample], '2026-06-19');
    expect(out).toContain('Addwork');
    expect(out).toContain('null deref on empty email');
    expect(out).toContain('Add billing export');
    expect(out).toContain('Fix login null deref');
  });
  it('caps length to Telegram limits', () => {
    const huge: RepoResult = { ...sample, qa: { ...sample.qa, edgeCases: Array.from({ length: 2000 }, (_, i) => `edge ${i}`) } };
    expect(buildTelegramBrief([huge], '2026-06-19').length).toBeLessThanOrEqual(3900);
  });
});

describe('buildObsidianNote', () => {
  it('renders frontmatter, sections and the new-task count', () => {
    const note = buildObsidianNote([sample], '2026-06-19');
    expect(note).toContain('tyyppi: dev-digest');
    expect(note).toContain('uudet_tehtavat: 1');
    expect(note).toContain('## Addwork');
    expect(note).toContain('Fix login null deref');
    expect(note).toContain('god object');
  });
});
