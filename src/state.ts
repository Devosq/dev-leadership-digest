import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { log } from './logger';
import type { Task } from './schemas';

export interface RepoState {
  lastRun?: string; // ISO of previous successful run (git window anchor)
  reportedHashes: string[]; // findings already surfaced — never re-report
  deepDiveCursor: number;
}

export interface State {
  repos: Record<string, RepoState>;
}

const MAX_HASHES = 500; // bound growth; oldest drop off

export function emptyRepoState(): RepoState {
  return { reportedHashes: [], deepDiveCursor: 0 };
}

export function loadState(path: string): State {
  try {
    if (!existsSync(path)) return { repos: {} };
    return normalizeState(JSON.parse(readFileSync(path, 'utf8')) as unknown);
  } catch (e) {
    log.warn('state', `could not read state, starting fresh: ${e instanceof Error ? e.message : String(e)}`);
    return { repos: {} };
  }
}

/** Coerce arbitrary parsed JSON into a valid State, defaulting missing/old fields. Pure — unit tested. */
export function normalizeState(raw: unknown): State {
  const repos: Record<string, RepoState> = {};
  const src = (raw as { repos?: unknown } | null)?.repos;
  if (src && typeof src === 'object') {
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      const e = (v ?? {}) as Partial<RepoState>;
      repos[k] = {
        lastRun: typeof e.lastRun === 'string' ? e.lastRun : undefined,
        reportedHashes: Array.isArray(e.reportedHashes) ? e.reportedHashes.filter((h) => typeof h === 'string') : [],
        deepDiveCursor: Number.isFinite(e.deepDiveCursor) ? (e.deepDiveCursor as number) : 0,
      };
    }
  }
  return { repos };
}

export function saveState(path: string, state: State): void {
  // Atomic: write to a temp file then rename, so a crash mid-write can't leave
  // truncated JSON that would wipe all dedup history on the next load.
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  renameSync(tmp, path);
}

/** Stable short hash (FNV-1a, 32-bit hex) for a task identity. Pure — unit tested. */
export function taskHash(repo: string, title: string): string {
  const key = `${repo}::${title.toLowerCase().replace(/\s+/g, ' ').trim()}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Split tasks into those not yet reported and the updated hash list. Pure — the
 * caller decides when to persist. Keeps the brief from repeating yesterday's items.
 */
export function dedupeTasks(
  tasks: Task[],
  reportedHashes: string[],
): { newTasks: Task[]; hashes: string[] } {
  const seen = new Set(reportedHashes);
  const newTasks: Task[] = [];
  for (const t of tasks) {
    const h = taskHash(t.repo, t.title);
    if (seen.has(h)) continue;
    seen.add(h);
    newTasks.push(t);
  }
  const hashes = [...reportedHashes, ...newTasks.map((t) => taskHash(t.repo, t.title))].slice(-MAX_HASHES);
  return { newTasks, hashes };
}
