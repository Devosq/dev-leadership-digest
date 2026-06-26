# Dev Leadership Digest

A nightly, **read-only** "virtual technical leadership team" for your repos. It runs four roles — **PM / CTO / QA / Growth** — over each repo, synthesises **3–5 pre-scoped tasks for your coder**, and delivers **one morning brief** to Telegram + Obsidian.

Built to realise the Cursor-Workforce idea on your own stack: **fully local (Ollama qwen), nothing leaves the VPS2 perimeter, ~€0/month**. It proposes — humans decide. It never writes code, opens PRs, commits, deploys, or migrates.

## How it works

```
Task Scheduler (05:00) → run-digest.ps1 → tunnel up → npx tsx src/index.ts
  per repo:  git pull --ff-only (read-only)
             repo-context  → bounded digest (git deltas + graphify-out graph + README + changed files)
             4 roles (local qwen)  +  synthesis  → tomorrow's tasks
             dedup vs state.json   (never re-report the same item)
  → combined Obsidian note (Strategia/dev-digest/digest-YYYY-MM-DD.md)
  → combined Telegram brief
```

The repo context fits a 14B model by condensing to deltas since last run + the graphify architecture graph + the most-recently-changed source files, under a hard char budget.

## Setup

1. `npm install`
2. `cp .env.example .env` and fill:
   - `OLLAMA_BASE_URL` — the SSH tunnel `http://127.0.0.1:11435/v1` (default) or `https://ai.example.com/v1`
   - `OLLAMA_API_KEY` — Bearer for the gateway (or `ollama` for the tunnel)
   - `DIGEST_REPOS` — already set to Addwork (`openclaw-backend`) + Xyven (`trading-journal-app`)
   - `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` — reuse an existing bot (empty = brief printed to log only, no send)
   - `OBSIDIAN_VAULT` — already set
3. Ensure the VPS2 Ollama tunnel works: `ssh -fN -L 11435:127.0.0.1:11434 root@<VPS2_IP>` (adjust host/user/key to yours). `run-digest.ps1` does this automatically.

## Commands

```bash
npm run dry                 # mock provider, no model/network, prints the brief — offline smoke test
npm run digest              # live: all repos, writes note + sends Telegram
npm run digest -- --repo=Addwork   # live: one repo
npm test                    # unit tests (pure functions)
npm run typecheck
```

## Activation (do this once, in order)

1. Fill `.env` (Telegram token + chat id).
2. **Verify ONE live run by hand** (the model path needs a reachable qwen):
   ```
   pwsh -File run-digest.ps1
   ```
   Confirm a real note lands in `Obsidian/Strategia/dev-digest/` and the findings look sane.
3. Register + enable the nightly schedule:
   ```
   pwsh -File register-task.ps1                       # registers DISABLED at 05:00
   Enable-ScheduledTask -TaskName 'DevLeadershipDigest'
   ```

## Governance (enforced)

- **Read-only**: only `git pull --ff-only` + file reads. No Edit/Write to repo code, no commit/push/PR/deploy/migration.
- **Fail-safe**: if the local model is unreachable the live run aborts cleanly (no misleading "all clear" note/Telegram). A single repo or role failure is logged and skipped without losing the other repos' dedup state.
- **Secret hygiene**: all output is run through `secretScrub` (Telegram token / API key / JWT / provider-token patterns) before it reaches Telegram or the synced vault. The config secrets are never put into a model prompt.
- **Atomic state**: `state.json` is written via temp-file + rename so a crash can't wipe dedup history.

## Cost

Fully local qwen on VPS2 (already paid) = **€0/month**. No Anthropic/OpenAI in the runtime.

## Known assumptions (v1)

- **Prompt injection**: repo source content goes into the model prompt. Output is advisory and never auto-executed, config secrets are not in the prompt, and output is secret-scrubbed — so the blast radius is "a fake task in the brief", acceptable for a local/no-exec tool. Re-evaluate before adding cloud LLM routing or task auto-execution.
- **Growth role** reasons from the named competitors (no live web) in v1.
- **Workstation must be on at 05:00** (v1). Phase 6 moves this to a VPS2 systemd timer for always-on.

See `plan.md` for the full design and phase breakdown.
