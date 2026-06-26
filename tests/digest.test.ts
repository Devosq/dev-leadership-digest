import { describe, it, expect } from 'vitest';
import { shouldAbortMidRunDeath } from '../src/digest';

// Mid-run-death guard (CODIAUKKO): ping() only proves the endpoint was alive at
// startup. If it dies afterwards every role degrades to its empty default and a
// misleading "all clear" note would be written. shouldAbortMidRunDeath() is the
// pure predicate that distinguishes "endpoint died mid-run" (0 real responses)
// from "genuinely nothing to report" and from dry-run / no-repo runs.
describe('shouldAbortMidRunDeath', () => {
  it('aborts a live run that scanned repos but got 0 real LLM responses (endpoint died)', () => {
    expect(shouldAbortMidRunDeath(false, 2, 0)).toBe(true);
    expect(shouldAbortMidRunDeath(false, 1, 0)).toBe(true);
  });

  it('does NOT abort when at least one real LLM response came back', () => {
    expect(shouldAbortMidRunDeath(false, 2, 1)).toBe(false);
    expect(shouldAbortMidRunDeath(false, 2, 8)).toBe(false);
  });

  it('never aborts in dry-run (mock always succeeds, even with 0 reported)', () => {
    expect(shouldAbortMidRunDeath(true, 2, 0)).toBe(false);
    expect(shouldAbortMidRunDeath(true, 0, 0)).toBe(false);
  });

  it('does not treat "no repos matched" as a death (nothing was attempted)', () => {
    expect(shouldAbortMidRunDeath(false, 0, 0)).toBe(false);
  });
});
