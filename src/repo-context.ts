import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { log } from './logger';
import type { RepoConfig } from './config';

export interface RepoDigest {
  name: string;
  oneLiner: string;
  competitors: string[];
  window: string; // human description of the change window
  changedFiles: string[];
  text: string; // bounded context block fed to the model
}

interface Section {
  label: string;
  body: string;
  priority: number; // higher = kept first
}

/** Greedily assemble labelled sections under a char budget, highest priority first. Pure — unit tested. */
export function assembleWithinBudget(sections: Section[], budget: number): string {
  const ordered = [...sections].sort((a, b) => b.priority - a.priority);
  const out: string[] = [];
  let used = 0;
  for (const s of ordered) {
    if (!s.body.trim()) continue;
    const header = `\n### ${s.label}\n`;
    let body = s.body;
    const remaining = budget - used - header.length;
    if (remaining <= 0) break;
    if (body.length > remaining) body = body.slice(0, remaining) + '\n…[truncated]';
    out.push(header + body);
    used += header.length + body.length;
  }
  return out.join('\n');
}

/** Run a read-only git command in `repoPath`. Returns '' on any failure. No shell. */
function git(repoPath: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function readIfExists(path: string, max: number): string {
  try {
    if (!existsSync(path)) return '';
    return readFileSync(path, 'utf8').slice(0, max);
  } catch {
    return '';
  }
}

const SOURCE_EXT = /\.(ts|tsx|js|jsx|py|go|rs|sql|vue|svelte)$/i;

/**
 * Build a token-bounded digest of one repo: change window + structure +
 * graphify report + README/deps + the content of the most-recently-changed
 * source files. Read-only. `sinceISO` bounds the git window (null => 14 days).
 */
export function buildRepoDigest(repo: RepoConfig, sinceISO: string | null, charBudget: number): RepoDigest {
  if (!existsSync(repo.path)) {
    log.warn('context', `repo path missing: ${repo.path}`);
    return { name: repo.name, oneLiner: repo.oneLiner, competitors: repo.competitors, window: 'n/a', changedFiles: [], text: '(repo path not found)' };
  }

  const since = sinceISO ?? '14 days ago';
  const window = sinceISO ? `since last run (${sinceISO})` : 'last 14 days';

  const commits = git(repo.path, ['log', `--since=${since}`, '--pretty=format:%h %s', '-n', '40']);
  const diffstat = git(repo.path, ['log', `--since=${since}`, '--stat', '--pretty=format:', '-n', '40']).slice(0, 4000);
  const changedRaw = git(repo.path, ['log', `--since=${since}`, '--name-only', '--pretty=format:']);
  const changedFiles = [...new Set(changedRaw.split('\n').map((s) => s.trim()).filter((f) => f && SOURCE_EXT.test(f)))].slice(0, 12);

  const tree = git(repo.path, ['ls-files']).split('\n').filter(Boolean);
  const dirCounts = new Map<string, number>();
  for (const f of tree) {
    const top = f.split('/').slice(0, 2).join('/');
    dirCounts.set(top, (dirCounts.get(top) ?? 0) + 1);
  }
  const structure = [...dirCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([d, n]) => `${d} (${n})`).join('\n');

  const readme = readIfExists(join(repo.path, 'README.md'), 3000);
  const pkg = readIfExists(join(repo.path, 'package.json'), 2000);
  const graph = readIfExists(join(repo.path, 'graphify-out', 'GRAPH_REPORT.md'), 4000);

  const changedContent = changedFiles
    .map((f) => {
      const body = readIfExists(join(repo.path, f), 4000);
      return body ? `--- ${f} ---\n${body}` : '';
    })
    .filter(Boolean)
    .join('\n\n');

  const text = assembleWithinBudget(
    [
      { label: 'Recent commits', body: commits || '(no commits in the change window — repo idle since last run)', priority: 90 },
      { label: 'Changed files (diffstat)', body: diffstat, priority: 80 },
      { label: 'Repo structure (top dirs, file counts)', body: structure, priority: 70 },
      { label: 'Dependency manifest', body: pkg, priority: 60 },
      { label: 'Architecture graph (graphify god nodes / communities)', body: graph, priority: 65 },
      { label: 'README', body: readme, priority: 50 },
      { label: 'Recently-changed source files (deep slice)', body: changedContent, priority: 75 },
    ],
    charBudget,
  );

  log.info('context', `built digest for ${repo.name}`, { changedFiles: changedFiles.length, chars: text.length, window });
  return { name: repo.name, oneLiner: repo.oneLiner, competitors: repo.competitors, window, changedFiles, text };
}
