import { z } from 'zod';

/** Shared severity / impact scale used across all role outputs. */
export const Severity = z.enum(['critical', 'high', 'medium', 'low']);
export type Severity = z.infer<typeof Severity>;

/** PM / Backlog role. */
export const PmSchema = z.object({
  missingFeatures: z.array(z.string()).default([]),
  backlog: z
    .array(z.object({ title: z.string(), impact: Severity, effort: Severity, why: z.string() }))
    .default([]),
  mrrIdeas: z.array(z.string()).default([]),
});
export type PmOutput = z.infer<typeof PmSchema>;

/** CTO / Tech-debt + Security role. */
export const CtoSchema = z.object({
  techDebt: z.array(z.object({ file: z.string(), issue: z.string(), severity: Severity })).default([]),
  securityRisks: z.array(z.object({ area: z.string(), risk: z.string(), severity: Severity })).default([]),
  scalingRisks: z.array(z.string()).default([]),
  bottlenecks: z.array(z.string()).default([]),
});
export type CtoOutput = z.infer<typeof CtoSchema>;

/** QA / Bug-hunt role. */
export const QaSchema = z.object({
  bugs: z
    .array(z.object({ file: z.string(), symptom: z.string(), severity: Severity, repro: z.string().optional() }))
    .default([]),
  edgeCases: z.array(z.string()).default([]),
  crashRisks: z.array(z.string()).default([]),
});
export type QaOutput = z.infer<typeof QaSchema>;

/** Growth / Competitor role (knowledge-based in v1 — no live web). */
export const GrowthSchema = z.object({
  competitorMoves: z.array(z.string()).default([]),
  missingVsCompetitors: z.array(z.string()).default([]),
  opportunities: z.array(z.string()).default([]),
});
export type GrowthOutput = z.infer<typeof GrowthSchema>;

/** Synthesis: the 3-5 pre-scoped tasks the coder gets in the morning. */
export const TaskSchema = z.object({
  title: z.string(),
  repo: z.string(),
  role: z.enum(['pm', 'cto', 'qa', 'growth']),
  priority: Severity,
  scopeHint: z.string(),
});
export type Task = z.infer<typeof TaskSchema>;

export const SynthSchema = z.object({
  tomorrowTasks: z.array(TaskSchema).max(8).default([]),
  oneLine: z.string().default(''),
});
export type SynthOutput = z.infer<typeof SynthSchema>;

export interface RepoResult {
  name: string;
  pm: PmOutput;
  cto: CtoOutput;
  qa: QaOutput;
  growth: GrowthOutput;
  synth: SynthOutput;
  newTasks: Task[];
}
