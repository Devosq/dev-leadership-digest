# Dev Leadership Digest

> A nightly, **read-only** "virtual technical leadership team" for your repos.
> Four roles — **PM / CTO / QA / Growth** — review each repo, synthesise
> **3–5 pre-scoped tasks**, and deliver **one morning brief** to Telegram and/or
> Obsidian. Fully local, ~€0/month. It proposes; humans decide.

![CI](https://github.com/Devosq/dev-leadership-digest/actions/workflows/ci.yml/badge.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

It never writes code, opens PRs, commits, deploys, or migrates — the only repo
operation is `git pull --ff-only`. Everything runs against a **local** Ollama
model, so no source code leaves your machine.

## How it works

```
scheduler → run digest → for each repo:
    git pull --ff-only                 (read-only)
    repo-context → bounded digest       (git deltas + optional graphify graph
                                         + README + most-changed files)
    4 roles (local model) + synthesis  → tomorrow's tasks
    dedupe vs state.json                (never re-report the same item)
  → one Obsidian note  +  one Telegram brief
```

The repo context is condensed to fit a ~14B model: deltas since last run + an
optional architecture graph + the most-recently-changed source files, under a
hard character budget.

## Setup

```bash
npm install
cp .env.example .env     # then fill it in
```

Key settings (see [`.env.example`](./.env.example)):
- `OLLAMA_BASE_URL` / `OLLAMA_API_KEY` / `OLLAMA_MODEL` — your local model endpoint.
- `DIGEST_REPOS` — JSON array of `{name, path, oneLiner, competitors}` for each repo.
- `TELEGRAM_*` / `OBSIDIAN_*` — outputs; leave blank to skip either.

## Commands

```bash
npm run dry        # mock provider, no model/network — offline smoke test
npm run digest     # live: all repos, writes note + sends Telegram
npm test           # 38 unit tests (pure functions, offline)
npm run typecheck  # tsc --noEmit, strict
```

Scheduling helpers for Windows Task Scheduler (`run-digest.ps1`,
`register-task.ps1`) are included as an example — adapt the tunnel/paths to your
setup, or use cron / systemd / any scheduler.

## Why it's safe to run unattended

- **Read-only** — only `git pull --ff-only` + file reads. No write/commit/push/PR/deploy/migration.
- **Fail-safe** — if the model is unreachable the live run aborts cleanly instead
  of writing a misleading "all clear". A single repo or role failure is logged and
  skipped without losing the other repos' dedup state.
- **Secret hygiene** — all output passes through `secretScrub` (token / API key /
  JWT patterns) before Telegram or the vault. Config secrets never enter a prompt.
- **Atomic state** — `state.json` is written via temp-file + rename, so a crash
  can't wipe dedup history.

## Prompt-injection posture
Repo source goes into the model prompt. Output is advisory and never
auto-executed, secrets aren't in the prompt, and output is secret-scrubbed — so
the worst case is "a bogus task in the brief". Re-evaluate before adding cloud LLM
routing or any task auto-execution.

## License
[MIT](./LICENSE) (c) Oscar Vatanen
