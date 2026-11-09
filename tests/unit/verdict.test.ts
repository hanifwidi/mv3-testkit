import { describe, expect, it } from 'vitest';
import { verdict, type Observations } from '../../src/verdict.js';

const complete: Observations = {
  stopped: true,
  runningAgain: true,
  before: { counter: 1, bootId: 'first' },
  after: { counter: 1, bootId: 'second' },
};

describe('evidence gate', () => {
  it('passes preserved state only after a proven new worker boot', () => {
    expect(verdict(complete)).toBe('PASS');
  });
  it('fails state loss after a proven new boot', () => {
    expect(verdict({ ...complete, after: { counter: 0, bootId: 'second' } })).toBe('FAIL');
  });
  it.each<Partial<Observations>>([
    { stopped: false }, { runningAgain: false }, { before: undefined },
    { after: undefined }, { after: { counter: 1, bootId: 'first' } },
    { stopped: false, after: { counter: 0, bootId: 'second' } },
  ])('does not infer lifecycle success or state loss from incomplete evidence: %j', (missing) => {
    expect(verdict({ ...complete, ...missing })).toBe('INCONCLUSIVE');
  });
});
