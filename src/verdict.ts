export type Verdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

export interface Observations {
  stopped: boolean;
  runningAgain: boolean;
  before?: { counter: number; bootId: string };
  after?: { counter: number; bootId: string };
}

// Absence of lifecycle evidence must never become either a pass or a state-loss claim.
export function verdict(evidence: Observations): Verdict {
  if (!evidence.stopped || !evidence.runningAgain || !evidence.before || !evidence.after)
    return 'INCONCLUSIVE';
  if (evidence.before.bootId === evidence.after.bootId) return 'INCONCLUSIVE';
  return evidence.after.counter === evidence.before.counter ? 'PASS' : 'FAIL';
}
