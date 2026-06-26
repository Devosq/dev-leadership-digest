import type { Llm } from './llm';
import type { RepoDigest } from './repo-context';
import {
  PmSchema,
  CtoSchema,
  QaSchema,
  GrowthSchema,
  SynthSchema,
  type PmOutput,
  type CtoOutput,
  type QaOutput,
  type GrowthOutput,
  type SynthOutput,
} from './schemas';

const COMMON = `You are part of a read-only nightly engineering review. You analyse a code repository digest and return findings as STRICT JSON only — no prose, no code fences. Be concrete and specific (name files, name features). Never invent files not present in the digest. Empty arrays are fine when you have nothing real to report. Severity scale: critical | high | medium | low.`;

function ctx(d: RepoDigest): string {
  return `Repo: ${d.name}\nProduct: ${d.oneLiner}\nChange window: ${d.window}\n\n=== REPO DIGEST ===\n${d.text}`;
}

export async function runPm(d: RepoDigest, llm: Llm): Promise<PmOutput> {
  return llm.json(
    {
      system: `${COMMON}\nROLE: Product Manager. Find missing features and the highest-impact backlog items that increase activation, retention, or MRR.`,
      user: `${ctx(d)}\n\nReturn JSON: { "missingFeatures": string[], "backlog": [{"title","impact","effort","why"}], "mrrIdeas": string[] }`,
    },
    PmSchema,
    { missingFeatures: [], backlog: [], mrrIdeas: [] },
  );
}

export async function runCto(d: RepoDigest, llm: Llm): Promise<CtoOutput> {
  return llm.json(
    {
      system: `${COMMON}\nROLE: CTO. Find technical debt, security risks, scaling risks, and bottlenecks. Prioritise things that break before customers notice.`,
      user: `${ctx(d)}\n\nReturn JSON: { "techDebt": [{"file","issue","severity"}], "securityRisks": [{"area","risk","severity"}], "scalingRisks": string[], "bottlenecks": string[] }`,
    },
    CtoSchema,
    { techDebt: [], securityRisks: [], scalingRisks: [], bottlenecks: [] },
  );
}

export async function runQa(d: RepoDigest, llm: Llm): Promise<QaOutput> {
  return llm.json(
    {
      system: `${COMMON}\nROLE: QA Engineer. Find likely bugs, unhandled edge cases, and crash risks — focus on the recently-changed source files in the digest.`,
      user: `${ctx(d)}\n\nReturn JSON: { "bugs": [{"file","symptom","severity","repro?"}], "edgeCases": string[], "crashRisks": string[] }`,
    },
    QaSchema,
    { bugs: [], edgeCases: [], crashRisks: [] },
  );
}

export async function runGrowth(d: RepoDigest, llm: Llm): Promise<GrowthOutput> {
  return llm.json(
    {
      system: `${COMMON}\nROLE: Growth / Competitor analyst. Compare the product to its competitors and find missing features + growth opportunities. (v1: reason from your knowledge of the named competitors — no live web.)`,
      user: `${ctx(d)}\n\nCompetitors: ${d.competitors.join(', ') || '(none given)'}\n\nReturn JSON: { "competitorMoves": string[], "missingVsCompetitors": string[], "opportunities": string[] }`,
    },
    GrowthSchema,
    { competitorMoves: [], missingVsCompetitors: [], opportunities: [] },
  );
}

/** Collapse the four role outputs into 3-5 pre-scoped tasks for the coder. */
export async function runSynth(
  repo: string,
  parts: { pm: PmOutput; cto: CtoOutput; qa: QaOutput; growth: GrowthOutput },
  llm: Llm,
): Promise<SynthOutput> {
  return llm.json(
    {
      system: `${COMMON}\nROLE: Engineering lead. From the four role reports, pick the 3-5 HIGHEST impact-per-effort items and turn each into ONE pre-scoped task a coder can start immediately. Bias to bugs and revenue-moving features. Each task: title, repo, role (pm|cto|qa|growth), priority, scopeHint (what to touch / acceptance).`,
      user: `Repo: ${repo}\n\nPM: ${JSON.stringify(parts.pm)}\nCTO: ${JSON.stringify(parts.cto)}\nQA: ${JSON.stringify(parts.qa)}\nGROWTH: ${JSON.stringify(parts.growth)}\n\nReturn JSON: { "tomorrowTasks": [{"title","repo","role","priority","scopeHint"}], "oneLine": string }`,
    },
    SynthSchema,
    { tomorrowTasks: [], oneLine: '' },
  );
}
