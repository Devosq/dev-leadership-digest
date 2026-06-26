# Contributing

Contributions welcome!

## Development
```bash
npm install
npm test            # vitest, offline (mock provider)
npm run typecheck   # tsc --noEmit, strict
```

## Guidelines
- Keep it **read-only and local-first** — no repo writes, no cloud LLM in the
  runtime, no auto-execution of model output.
- Add a test for any logic change (`tests/`, vitest).
- Conventional Commits, English. Never commit secrets (`.env` is git-ignored).
