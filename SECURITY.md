# Security Policy

## Reporting a vulnerability
Please report security issues privately via GitHub Security Advisories
("Report a vulnerability" on the Security tab), not a public issue.

## Design notes
- Secrets live in `.env` (git-ignored) and never enter a model prompt.
- All output passes through `secretScrub` (token / API key / JWT patterns) before
  Telegram or the Obsidian vault.
- The tool is read-only on your repos (`git pull --ff-only` + file reads only) and
  never executes model output. See the prompt-injection note in the README.
