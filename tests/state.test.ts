import { describe, it, expect } from 'vitest';
import { taskHash, dedupeTasks, normalizeState } from '../src/state';
import type { Task } from '../src/schemas';

describe('normalizeState', () => {
  it('defaults a fresh state on junk input', () => {
    expect(normalizeState(null)).toEqual({ repos: {} });
    expect(normalizeState('nope')).toEqual({ repos: {} });
    expect(normalizeState({})).toEqual({ repos: {} });
  });

  it('fills missing/old fields so deepDiveCursor never becomes NaN', () => {
    const out = normalizeState({ repos: { Addwork: { lastRun: '2026-06-18' } } });
    expect(out.repos.Addwork).toEqual({ lastRun: '2026-06-18', reportedHashes: [], deepDiveCursor: 0 });
  });

  it('drops non-string hashes and non-finite cursors', () => {
    const out = normalizeState({ repos: { A: { reportedHashes: ['ok', 5, null], deepDiveCursor: 'x' } } });
    expect(out.repos.A).toEqual({ lastRun: undefined, reportedHashes: ['ok'], deepDiveCursor: 0 });
  });
});

const mk = (repo: string, title: string): Task => ({ repo, title, role: 'qa', priority: 'high', scopeHint: 'x' });

describe('taskHash', () => {
  it('is stable and case/space-insensitive', () => {
    expect(taskHash('Addwork', 'Fix login')).toBe(taskHash('Addwork', '  fix   LOGIN '));
  });
  it('differs by repo', () => {
    expect(taskHash('A', 'same')).not.toBe(taskHash('B', 'same'));
  });
});

describe('dedupeTasks', () => {
  it('returns all tasks as new on first sight and records their hashes', () => {
    const { newTasks, hashes } = dedupeTasks([mk('A', 'one'), mk('A', 'two')], []);
    expect(newTasks).toHaveLength(2);
    expect(hashes).toHaveLength(2);
  });

  it('filters tasks already reported', () => {
    const first = dedupeTasks([mk('A', 'one')], []);
    const second = dedupeTasks([mk('A', 'one'), mk('A', 'two')], first.hashes);
    expect(second.newTasks.map((t) => t.title)).toEqual(['two']);
  });

  it('dedupes duplicates within the same batch', () => {
    const { newTasks } = dedupeTasks([mk('A', 'dup'), mk('A', 'DUP')], []);
    expect(newTasks).toHaveLength(1);
  });
});
