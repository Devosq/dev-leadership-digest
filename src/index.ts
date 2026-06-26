import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runDigest } from './digest';
import { log } from './logger';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv: string[]): { dryRun: boolean; onlyRepo?: string } {
  const dryRun = argv.includes('--dry-run');
  const repoArg = argv.find((a) => a.startsWith('--repo='));
  const onlyRepo = repoArg?.split('=')[1];
  // Treat --repo= (empty) as "all repos" rather than a filter that matches none.
  return { dryRun, onlyRepo: onlyRepo ? onlyRepo : undefined };
}

async function main(): Promise<void> {
  const { dryRun, onlyRepo } = parseArgs(process.argv.slice(2));
  log.info('digest', `starting${dryRun ? ' (dry-run / mock)' : ''}`, { onlyRepo: onlyRepo ?? 'all' });
  const { results, notePath } = await runDigest({ dryRun, onlyRepo, statePath: join(ROOT, 'state.json') });
  const totalNew = results.reduce((n, r) => n + r.newTasks.length, 0);
  log.info('digest', `done`, { repos: results.length, newTasks: totalNew, notePath });
}

main().catch((e) => {
  log.error('digest', `fatal: ${(e as Error).message}`);
  process.exit(1);
});
