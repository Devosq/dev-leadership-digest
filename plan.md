# Dev Leadership Digest — Build Plan (v1)

**Created:** 2026-06-19
**Status:** BUILDING v1 — go given 2026-06-19. Decisions locked: (1) run = workstation Task Scheduler, (2) synthesis = fully-local qwen (€0, nothing leaves VPS2, no Anthropic in runtime), (3) repos = Addwork (openclaw-backend) + Xyven.
**Owner:** Claude (build) → the owner (review/run)
**Goal repo of this doc:** `~/oscar-tasks/dev-leadership-digest/`

---

## 1. Goal & non-goals

**Goal:** Realize the "virtual technical leadership team" outcome (the Cursor Workforce vision) on your OWN stack, at ~€0, with code never leaving the EU perimeter. A scheduled nightly job analyzes each target repo with 4 READ-ONLY roles (PM / CTO / QA / Growth), synthesizes a prioritized "tomorrow's task list", and delivers ONE morning brief to Telegram + Obsidian. The hired coder wakes to a pre-scoped backlog; your time goes to sales/funding.

**Non-goals (hard):**
- It does NOT write code, open PRs, commit, push, deploy, or run migrations. **Read-only.** It PROPOSES; humans decide. (Sidesteps Tier-1 governance + data-residency risk that Cursor Cloud Agents carry.)
- It is NOT a replacement for the coder — it is the CTO/PM/QA layer that feeds the coder.
- v1 does not auto-create GitHub issues (optional v2, gated).

**Why this beats Cursor for the analysis lane:** 4 of the 5 agents in your plan are read-only analysis. They need no cloud VM. Running them on local Ollama (qwen2.5-coder:14b, €0) keeps Addwork client data + Xyven code off Anysphere servers, and costs ~€0–3/mo vs Cursor's ~€200–460/mo for the same daily cadence.

---

## 2. Architecture

```
 Task Scheduler / systemd timer (nightly ~05:00 Helsinki)
        │
        ▼
 digest orchestrator (TS/Node, ~/oscar-tasks/dev-leadership-digest)
        │
        ├── for each target repo (Addwork=openclaw-backend, Xyven):
        │     1. git pull --ff-only            (read-only refresh)
        │     2. repo-context.ts  ──► bounded "repo digest" (~8–20k tokens)
        │            sources: git log/diff since lastRun, file tree,
        │                     graphify-out/GRAPH_REPORT.md (god nodes/communities),
        │                     README, package.json, (optional) Sentry recent issues
        │     3. roles.ts  ──► run 4 roles on the digest:
        │            PM · CTO · QA · Growth   (LLM = Ollama qwen local, €0)
        │     4. synth.ts ──► "tomorrow's 3–5 tasks" + dedup vs state.json
        │            (LLM = configurable: ollama €0  OR  Sonnet ~$0.05/run)
        │
        ├── output.ts ──► Obsidian note (full) + Telegram brief (concise)
        └── state.json ──► lastRun per repo, reported-findings hashes, deep-dive cursor
```

**LLM routing (cost + residency):** heavy code reading = **Ollama qwen2.5-coder:14b on VPS2** (€0, nothing leaves VPS2). Final synthesis = configurable: pure-local (qwen, fully EU, €0) OR Sonnet (sharper prioritization; only the already-summarized findings — NOT raw code — go to Anthropic). Default: **Sonnet synthesis** (sharper, <$3/mo) with a `--local` flag for fully-local.

---

## 3. The 4 roles + synthesis (exact contracts)

Each role gets the repo digest and returns a Zod-validated object. Prompts kept terse; output strictly structured so the brief is mechanical to assemble.

| Role | Input | Output (schema) |
|---|---|---|
| **PM / Backlog** | digest + README + recent commits | `{ missingFeatures[], prioritizedBacklog[{title, impact, effort, why}], activationRetentionMrrIdeas[] }` |
| **CTO / Tech-debt+Security** | digest + graphify god-nodes + deps | `{ techDebt[{file, issue, severity}], securityRisks[{area, risk, severity}], scalingRisks[], bottlenecks[] }` |
| **QA / Bug-hunt** | digest + recently-changed files + (Sentry) | `{ bugs[{file, symptom, severity, repro?}], edgeCases[], crashRisks[] }` |
| **Growth / Competitor** | product one-liner + web search | `{ competitorMoves[], missingVsCompetitors[], growthOpportunities[] }` |
| **Synthesis** | all four role outputs + state (already-reported) | `{ tomorrowTasks[{title, repo, role, priority, scopeHint}] (3–5), oneLineForthe owner }` |

**Severity scale:** `critical | high | medium | low`. Synthesis surfaces only NEW findings (deduped against `state.json`) and ranks by impact×(1/effort).

---

## 4. Repo context builder (fitting a codebase into a 14B model)

A whole codebase will not fit in qwen2.5-coder:14b context, so `repo-context.ts` condenses to a token-bounded digest:
- `git log --since="<lastRun>" --stat` + `git diff --stat <lastRun>..HEAD` → what changed since last night
- top-level + key-dir file tree, LOC per dir
- `graphify-out/GRAPH_REPORT.md` → god nodes, communities, top-coupled files (already generated — reuse)
- `README.md`, `package.json` (deps + scripts), `progress.txt`/CHANGELOG if present
- **rotating deep-dive:** each night pick ONE subsystem (round-robin over graphify communities) and include its key files in full for a deeper QA/CTO pass
- (optional v2) Sentry recent issues for the repo's product (needs Sentry API token)

Token budget enforced (~8–20k). This is the iterative-retrieval pattern: focus on deltas + one rotating deep slice, not the whole tree every night → cheaper, higher signal, less noise.

---

## 5. Output

**Obsidian note (full findings):** `Obsidian Vault/Strategia/dev-digest/<repo>-YYYY-MM-DD.md` — all role outputs, frontmatter (repo, date, counts), `[[links]]`.

**Telegram brief (concise, the thing the owner reads at breakfast):**
```
🌅 Dev Digest — 2026-06-XX
🏢 Addwork (openclaw-backend)
🐞 Top bugs: 1) … 2) … 3) …
✨ Top features: 1) … 2) … 3) …
📈 Competitor: …
🛠️ Tomorrow (for coder): 1) … 2) … 3) …
📄 Full: Obsidian Strategia/dev-digest/…
```
One combined message covering both repos (configurable to per-repo). Sent via Telegram Bot API (reuse existing bot token + chat_id).

---

## 6. Scheduling

- **v1 (pilot):** Workstation **Task Scheduler**, nightly 05:00 Helsinki, against `~/dev/openclaw-backend` (+ Xyven) — repos already cloned + graphified. Ollama via existing SSH tunnel (ccrc pattern) or `ai.example.com` Bearer. Simplest, no new secrets, fully EU. Caveat: workstation must be on overnight.
- **v2 (always-on):** **VPS2 systemd timer** + read-only deploy-key clones of the repos on VPS2; Ollama local (no tunnel). Survives workstation-off. Adds: 2 deploy keys + nightly `git pull`.

Recommend v1 for the pilot, promote to v2 once signal is proven.

---

## 7. State & noise control (`state.json`)

- `lastRun` per repo (git window).
- `reportedHashes`: hash of each surfaced finding → never re-report the same bug/feature twice (the thing simple cron digests get wrong → they re-report and become ignored).
- `deepDiveCursor`: round-robin index over graphify communities for the rotating deep slice.

---

## 8. Governance / hard-stops (enforced in code)

- **Read-only filesystem access to repos** — module imports NO Edit/Write to repo paths; only `git pull --ff-only` (fast-forward, no merge commits) + reads.
- **No git push / commit / PR / deploy / migration** — not wired, not importable.
- **Secret-scan before send** — strip anything matching key/token patterns from Obsidian + Telegram output.
- **Findings are proposals** — every task in the brief is a suggestion for the owner/coder, never auto-executed.
- Sub-agent prefix honored if any role is delegated: "do not deploy, do not run migrations, do not call deploy MCP tools."

---

## 9. Cost

| Mode | Per night | Per month |
|---|---|---|
| Ollama-only (qwen VPS2) | €0 | **€0** |
| + Sonnet synthesis (summaries only) | ~$0.05–0.10 | **<$3** |
| (Cursor equivalent daily cadence) | — | €200–460 |

VPS2 is already paid (sunk). No new recurring infra.

---

## 10. Tech stack & file layout

TS + Node (matches vault-copilot / growth-engine), Zod (finding schemas), Vitest, Telegram Bot API, Ollama HTTP. No DB — `state.json` file. Pluggable LLM like vault-copilot.

```
~/oscar-tasks/dev-leadership-digest/
  src/
    config.ts            # repos[], LLM provider, telegram, paths, token budget
    llm.ts               # ollama (default €0) | sonnet (synthesis opt) | mock
    repo-context.ts      # git + graphify-out + README -> bounded digest
    roles/{pm,cto,qa,growth}.ts
    synth.ts             # tomorrow's tasks + dedup
    output/{obsidian,telegram}.ts
    state.ts             # state.json read/write, finding-hash dedup
    digest.ts            # orchestrator (per repo)
    index.ts             # CLI entry (run all / one repo / --local / --dry-run)
  tests/                 # pure-fn coverage: context bounding, dedup, schema, telegram fmt
  state.json
  .env.example
  README.md
  plan.md  (this file)
```

---

## 11. Config / secrets (`.env`)

- `OLLAMA_BASE_URL` (ai.example.com or tunnel), `OLLAMA_API_KEY` (Bearer), `OLLAMA_MODEL=qwen2.5-coder:14b`
- `DIGEST_SYNTH_PROVIDER=sonnet|ollama`, `ANTHROPIC_API_KEY` (only if sonnet)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (reuse existing)
- `OBSIDIAN_VAULT` path, `DIGEST_REPOS` (JSON: [{name, path, productOneLiner, competitors[]}])
- `SENTRY_API_TOKEN` (optional, v2)

All via `.env`; nothing hardcoded; `.env.example` committed.

---

## 12. Build phases (each independently testable)

| Phase | Deliverable | Acceptance |
|---|---|---|
| **0 Scaffold** | project + config + llm.ts (ollama+mock) + telegram/obsidian writers | mock "hello digest" lands in Obsidian + Telegram |
| **1 Context** | repo-context.ts | Addwork digest JSON under token budget; unit-tested on fixture |
| **2 Roles** | 4 role runners on local Ollama | 4 schema-valid finding objects for Addwork |
| **3 Synth+Output** | synth.ts + full single-repo run | real nightly brief for Addwork (Telegram+Obsidian), the owner reviews signal |
| **4 State+2nd repo** | dedup + rotating deep-dive + Xyven | 2-repo run; no duplicate findings across 2 nights |
| **5 Schedule** | Task Scheduler v1 | fires nightly, brief by morning |
| **6 (later) VPS2** | systemd timer + deploy-key clones | always-on, workstation-independent |

**Definition of done (v1):** Phases 0–5 green; one combined morning brief for Addwork + Xyven arrives daily; verification loop (typecheck/lint/tests, read-only confirmed, no secrets in output) passes.

---

## 13. Open questions (need your call before/at build start)

1. **Run location v1:** workstation Task Scheduler (simple, EU, but PC must be on) vs straight to VPS2 (always-on, +2 deploy keys)? → *recommend: workstation pilot → VPS2 v2.*
2. **Synthesis provider:** pure-local qwen (€0, fully EU) vs Sonnet synthesis (<$3/mo, sharper prioritization, summaries only leave)? → *recommend: Sonnet synthesis.*
3. **Repos for v1:** Addwork (openclaw-backend, confirmed at ~/dev) + Xyven (path TBD) only? → *recommend: those two.*
4. **Sentry pull-in** for QA/CTO (needs Sentry API token)? → *recommend: v2, skip in v1.*
5. **Telegram target:** which existing bot + chat_id? (DIP Work / meeting-intel bot?)
6. **Brief cadence:** one combined morning brief vs per-repo? → *recommend: one combined.*

---

## 14. Risks

- **Local model quality:** qwen2.5-coder:14b is weaker than frontier at deep reasoning → mitigate with Sonnet synthesis + rotating deep-dive on bounded slices. If signal is weak after Phase 3, escalate synthesis to Sonnet or add a weekly deeper pass.
- **Noise/ignored brief:** dedup + impact ranking + 3–5 task cap keep it actionable. If the brief is ever ignored, that's the signal to cut scope, not add.
- **Workstation-off (v1):** accept for pilot; v2 VPS2 fixes it.
- **Token-budget overrun:** hard cap in repo-context; truncate lowest-value sources first.

## 15. Effort estimate

Phases 0–3 ≈ one focused Claude build session; Phases 4–5 ≈ a second. ~1–2 days of build time. Each phase shippable + testable on its own.
