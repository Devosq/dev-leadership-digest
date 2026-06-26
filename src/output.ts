import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { log } from './logger';
import type { RepoResult } from './schemas';

/**
 * Redact anything that looks like a secret before it leaves the process to
 * Telegram or a synced Obsidian vault. Defence-in-depth: the digest is read-only
 * but a model could echo a key it saw in a config file. Pure — unit tested.
 */
export function secretScrub(text: string): string {
  return text
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g, '[REDACTED_TG_TOKEN]') // telegram bot token
    .replace(/\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_KEY]') // openai / anthropic-style
    .replace(/\b(?:ghp_|gho_|github_pat_|AKIA|xox[abpr]-|hcloud)[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_TOKEN]') // common provider tokens
    .replace(/\b(?:Bearer|Key)\s+[A-Za-z0-9._-]{16,}\b/gi, '[REDACTED_AUTH]')
    .replace(/\beyJ[A-Za-z0-9._-]{20,}\b/g, '[REDACTED_JWT]') // JWT (supabase service_role etc)
    // Long opaque mixed-charset token; keep all-hex runs (commit SHAs, hashes) readable.
    .replace(/\b[A-Za-z0-9]{40,}\b/g, (m) => (/^[0-9a-f]+$/i.test(m) ? m : '[REDACTED_TOKEN]'));
}

const top = <T>(arr: T[], n: number): T[] => arr.slice(0, n);

/** Concise morning brief for Telegram. Pure — unit tested. */
export function buildTelegramBrief(results: RepoResult[], date: string): string {
  const lines: string[] = [`🌅 Dev Digest — ${date}`];
  for (const r of results) {
    lines.push('', `🏢 ${r.name}`);
    const bugs = top(r.qa.bugs, 3);
    if (bugs.length) lines.push('🐞 ' + bugs.map((b) => `${b.symptom} (${b.file}, ${b.severity})`).join(' · '));
    const feats = top(r.pm.backlog, 3);
    if (feats.length) lines.push('✨ ' + feats.map((f) => `${f.title} (${f.impact})`).join(' · '));
    const comp = top(r.growth.missingVsCompetitors, 1);
    if (comp.length) lines.push('📈 ' + comp[0]);
    if (r.newTasks.length) {
      lines.push('🛠️ Tomorrow:');
      r.newTasks.forEach((t, i) => lines.push(`  ${i + 1}. [${t.priority}] ${t.title}`));
    } else {
      lines.push('🛠️ Tomorrow: (no new items vs last run)');
    }
  }
  return secretScrub(lines.join('\n')).slice(0, 3900);
}

/** Full markdown note for the Obsidian vault. Pure — unit tested. */
export function buildObsidianNote(results: RepoResult[], date: string): string {
  const totalNew = results.reduce((n, r) => n + r.newTasks.length, 0);
  const out: string[] = [
    '---',
    `luotu: ${date}`,
    'tyyppi: dev-digest',
    `repot: ${results.map((r) => r.name).join(', ')}`,
    `uudet_tehtavat: ${totalNew}`,
    '---',
    '',
    `# Dev Leadership Digest — ${date}`,
  ];
  for (const r of results) {
    out.push('', `## ${r.name}`, '');
    if (r.synth.oneLine) out.push(`> ${r.synth.oneLine}`, '');
    out.push('### 🛠️ Tomorrow (uudet tehtävät koodarille)');
    if (r.newTasks.length) {
      r.newTasks.forEach((t) => out.push(`- **[${t.priority}] ${t.title}** _(${t.role})_ — ${t.scopeHint}`));
    } else {
      out.push('- _(ei uusia tehtäviä vs edellinen ajo)_');
    }
    out.push('', '### 🐞 QA — bugit / edge caset');
    r.qa.bugs.forEach((b) => out.push(`- [${b.severity}] ${b.file}: ${b.symptom}${b.repro ? ` — repro: ${b.repro}` : ''}`));
    r.qa.edgeCases.forEach((e) => out.push(`- edge: ${e}`));
    out.push('', '### 🏗️ CTO — tech-debt / security');
    r.cto.techDebt.forEach((d) => out.push(`- [${d.severity}] ${d.file}: ${d.issue}`));
    r.cto.securityRisks.forEach((s) => out.push(`- [${s.severity}] SEC ${s.area}: ${s.risk}`));
    r.cto.bottlenecks.forEach((b) => out.push(`- bottleneck: ${b}`));
    out.push('', '### ✨ PM — backlog / featuret');
    r.pm.backlog.forEach((f) => out.push(`- **${f.title}** (impact ${f.impact}, effort ${f.effort}) — ${f.why}`));
    r.pm.missingFeatures.forEach((m) => out.push(`- missing: ${m}`));
    out.push('', '### 📈 Growth — kilpailija / mahdollisuudet');
    r.growth.missingVsCompetitors.forEach((m) => out.push(`- vs kilpailija: ${m}`));
    r.growth.opportunities.forEach((o) => out.push(`- mahdollisuus: ${o}`));
  }
  return secretScrub(out.join('\n'));
}

export function writeObsidianNote(vault: string, dir: string, date: string, content: string): string | null {
  if (!vault) {
    log.warn('output', 'OBSIDIAN_VAULT unset — skipping note');
    return null;
  }
  // Guard against an env-supplied OBSIDIAN_DIGEST_DIR escaping the vault root.
  const vaultRoot = resolve(vault);
  const outDir = resolve(vault, dir);
  if (outDir !== vaultRoot && !outDir.startsWith(vaultRoot + sep)) {
    throw new Error(`OBSIDIAN_DIGEST_DIR escapes the vault: ${outDir}`);
  }
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `digest-${date}.md`);
  writeFileSync(path, content, 'utf8');
  log.info('output', `wrote Obsidian note`, { path });
  return path;
}

export async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  if (!token || !chatId) {
    log.warn('output', 'TELEGRAM_BOT_TOKEN/CHAT_ID unset — skipping Telegram send');
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    log.error('output', `telegram send failed: HTTP ${res.status}`);
    return false;
  }
  log.info('output', 'sent Telegram brief');
  return true;
}
