import { execFileSync } from 'node:child_process';
import { config } from './config';
import { makeLlm } from './llm';
import { buildRepoDigest } from './repo-context';
import { runPm, runCto, runQa, runGrowth, runSynth } from './roles';
import { loadState, saveState, emptyRepoState, dedupeTasks } from './state';
import { buildObsidianNote, buildTelegramBrief, writeObsidianNote, sendTelegram } from './output';
import { log } from './logger';
import type { RepoResult } from './schemas';

export interface RunOptions {
  dryRun: boolean;
  onlyRepo?: string;
  statePath: string;
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Mid-run-death guard predicate. Pure — unit tested.
 *
 * `ping()` only proves the model endpoint was alive at startup. If it dies after
 * the ping, every per-role call degrades to its empty default (see llm.ts
 * fallback) and the results look exactly like a genuine "all clear". This tells
 * the two apart: a LIVE run that scanned at least one repo but got ZERO real
 * model responses almost certainly means the endpoint died mid-run, so we must
 * abort before writing the note / Telegram.
 *
 * @param dryRun     mock provider always succeeds → never guard in dry-run
 * @param repoCount  repos actually scanned (no repos => nothing to report, not a death)
 * @param successCount  number of REAL (non-fallback) LLM responses this run
 */
export function shouldAbortMidRunDeath(dryRun: boolean, repoCount: number, successCount: number): boolean {
  return !dryRun && repoCount > 0 && successCount === 0;
}

/**
 * One nightly pass: per repo -> read-only refresh -> bounded digest -> 4 roles
 * (local Ollama) -> synthesis -> dedup -> combined Obsidian note + Telegram brief.
 * In dry-run nothing is written or sent and the brief is printed to stdout.
 */
export async function runDigest(opts: RunOptions): Promise<{ results: RepoResult[]; notePath: string | null }> {
  const llm = makeLlm({
    provider: opts.dryRun ? 'mock' : 'ollama',
    baseUrl: config.OLLAMA_BASE_URL,
    apiKey: config.OLLAMA_API_KEY,
    model: config.OLLAMA_MODEL,
    timeoutMs: config.LLM_TIMEOUT_MS,
    maxTokens: config.LLM_MAX_TOKENS,
  });

  const state = loadState(opts.statePath);
  const repos = config.DIGEST_REPOS.filter(
    (r) => !opts.onlyRepo || r.name.toLowerCase() === opts.onlyRepo!.toLowerCase(),
  );
  if (repos.length === 0) log.warn('digest', 'no repos matched — check DIGEST_REPOS / --repo');

  // Fail fast in live mode if the local model is unreachable, so a nightly run
  // with the Ollama tunnel down logs an error instead of writing a misleading
  // "all clear" empty note + Telegram.
  if (!opts.dryRun && !(await llm.ping())) {
    throw new Error('Ollama endpoint unreachable — aborting live run (no note/Telegram written). Bring up the Ollama tunnel and retry.');
  }

  const results: RepoResult[] = [];
  for (const repo of repos) {
    const rs = state.repos[repo.name] ?? emptyRepoState();
    try {
      // Read-only refresh. ff-only never creates merge commits; failures are
      // non-fatal (offline / detached / no upstream) — analyse what is on disk.
      if (!opts.dryRun) {
        try {
          execFileSync('git', ['pull', '--ff-only'], { cwd: repo.path, stdio: 'ignore' });
        } catch {
          log.warn('digest', `git pull --ff-only failed, analysing current checkout: ${repo.name}`);
        }
      }

      const digest = buildRepoDigest(repo, rs.lastRun ?? null, config.CONTEXT_CHAR_BUDGET);
      // Sequential: one local model, avoid hammering Ollama with 4 concurrent calls.
      const pm = await runPm(digest, llm);
      const cto = await runCto(digest, llm);
      const qa = await runQa(digest, llm);
      const growth = await runGrowth(digest, llm);
      const synth = await runSynth(repo.name, { pm, cto, qa, growth }, llm);

      const { newTasks, hashes } = dedupeTasks(synth.tomorrowTasks, rs.reportedHashes);
      results.push({ name: repo.name, pm, cto, qa, growth, synth, newTasks });

      // Only advance this repo's state on success — a failed repo retries from
      // its old window next run rather than silently skipping changes.
      state.repos[repo.name] = {
        lastRun: new Date().toISOString(),
        reportedHashes: hashes,
        deepDiveCursor: rs.deepDiveCursor + 1,
      };
      log.info('digest', `analysed ${repo.name}`, { newTasks: newTasks.length });
    } catch (e) {
      // One repo failing must not abort the pass or lose the other repos' state.
      log.error('digest', `skipping ${repo.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Mid-run-death guard: ping() only proved the endpoint was alive at startup.
  // If it died afterwards every role call degrades to its empty default (see
  // llm.ts fallback) and the results below would look like a genuine "all clear".
  // A live run where the endpoint produced ZERO real responses after ping must
  // abort here — BEFORE writing the Obsidian note or sending Telegram — so the
  // run fails loudly instead of publishing a misleading empty digest. Skipped in
  // dry-run (mock always succeeds) and when there were simply no repos to scan.
  if (shouldAbortMidRunDeath(opts.dryRun, repos.length, llm.successCount())) {
    throw new Error(
      'Ollama endpoint produced 0 successful responses after ping — likely died mid-run. ' +
        'Aborting before writing note/Telegram to avoid a misleading "all clear" digest. ' +
        'Repo state is unchanged; bring the Ollama tunnel back up and retry.',
    );
  }

  const date = todayISODate();
  const note = buildObsidianNote(results, date);
  const brief = buildTelegramBrief(results, date);

  if (opts.dryRun) {
    process.stdout.write(brief + '\n');
    return { results, notePath: null };
  }

  const notePath = writeObsidianNote(config.OBSIDIAN_VAULT, config.OBSIDIAN_DIGEST_DIR, date, note);
  // Persist state BEFORE the best-effort Telegram send: a Telegram outage must
  // not cause every task to be re-reported tomorrow.
  saveState(opts.statePath, state);
  try {
    await sendTelegram(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, brief);
  } catch (e) {
    log.error('output', `telegram send threw (state already saved): ${e instanceof Error ? e.message : String(e)}`);
  }
  return { results, notePath };
}
