import { describe, it, expect } from 'vitest';
import { assembleWithinBudget } from '../src/repo-context';

describe('assembleWithinBudget', () => {
  it('orders sections by priority (highest first)', () => {
    const out = assembleWithinBudget(
      [
        { label: 'low', body: 'L', priority: 1 },
        { label: 'high', body: 'H', priority: 9 },
      ],
      1000,
    );
    expect(out.indexOf('high')).toBeLessThan(out.indexOf('low'));
  });

  it('skips empty sections', () => {
    const out = assembleWithinBudget([{ label: 'empty', body: '   ', priority: 5 }], 1000);
    expect(out).toBe('');
  });

  it('never exceeds the budget and marks truncation', () => {
    const big = 'x'.repeat(500);
    const out = assembleWithinBudget([{ label: 'big', body: big, priority: 5 }], 100);
    expect(out.length).toBeLessThanOrEqual(100 + 20); // header + truncation marker slack
    expect(out).toContain('[truncated]');
  });

  it('stops adding sections once the budget is exhausted', () => {
    const out = assembleWithinBudget(
      [
        { label: 'first', body: 'a'.repeat(90), priority: 9 },
        { label: 'second', body: 'b'.repeat(90), priority: 1 },
      ],
      100,
    );
    expect(out).toContain('first');
    expect(out).not.toContain('second');
  });
});
