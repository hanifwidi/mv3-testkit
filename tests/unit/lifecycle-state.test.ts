import { expect, it } from 'vitest';
import { RESTART_STATES, LifecycleStateMachine } from '../../src/core/lifecycle-state.js';
import { lifecycleVerdict, messageRecoveryVerdict, type LifecycleEvidence } from '../../src/core/diagnostics.js';

function proof(): LifecycleEvidence {
  const machine = new LifecycleStateMachine();
  machine.advance('STARTING', 0);
  machine.advance('RUNNING', 1);
  machine.advance('STOP_REQUESTED', 1);
  machine.advance('STOPPED_OBSERVED', 2);
  machine.advance('EVENT_TRIGGERED', 2);
  machine.advance('RUNNING_AGAIN', 3);
  return {
    runId: 'synthetic-test-only', driver: 'experimental-cdp-stopWorker', phases: machine.phases,
    startedAt: new Date().toISOString(), extensionId: 'a'.repeat(32),
    workerScriptURL: `chrome-extension://${'a'.repeat(32)}/background.js`,
    initialVersionId: 'v1', finalVersionId: 'v1', stopped: true, restarted: true, identityChanged: true,
    events: [
      { at: new Date().toISOString(), status: 'running', versionId: 'v1' },
      { at: new Date().toISOString(), status: 'stopped', versionId: 'v1' },
      { at: new Date().toISOString(), status: 'running', versionId: 'v1' },
    ],
  };
}
it('records the complete allowed restart path with event cursors', () => {
  const evidence = proof();
  expect(evidence.phases.map(p => p.state)).toEqual([...RESTART_STATES]);
  expect(lifecycleVerdict(evidence, true).verdict).toBe('PASS');
  expect(messageRecoveryVerdict(evidence, false)).toMatchObject({ verdict: 'FAIL', code: 'MESSAGE_NOT_RECOVERED' });
});
it('rejects skipped transitions and backward observation cursors', () => {
  const m = new LifecycleStateMachine();
  expect(() => m.advance('STOPPED_OBSERVED', 0)).toThrow(/Invalid lifecycle transition/);
  m.advance('STARTING', 0);
  m.advance('RUNNING', 2);
  expect(() => m.advance('STOP_REQUESTED', 1)).toThrow();
});
it('retains partial progress and makes INCONCLUSIVE terminal', () => {
  const m = new LifecycleStateMachine();
  m.advance('STARTING', 0);
  m.advance('INCONCLUSIVE', 0);
  expect(m.phases.map(p => p.state)).toEqual(['UNDISCOVERED', 'STARTING', 'INCONCLUSIVE']);
  expect(() => m.advance('RUNNING', 1)).toThrow();
});
it.each(['old-running', 'old-stop', 'missing-phases', 'no-initial-running', 'wrong-version', 'backward-cursor'])(
  'returns INCONCLUSIVE instead of PASS or FAIL for %s', defect => {
    const p = proof();
    if (defect === 'old-running') p.phases[5].eventCursor = 3;
    if (defect === 'old-stop') p.phases[3].eventCursor = 2;
    if (defect === 'missing-phases') p.phases.splice(3, 1);
    if (defect === 'no-initial-running') p.events[0].status = 'starting';
    if (defect === 'wrong-version') p.events[2].versionId = 'v2';
    if (defect === 'backward-cursor') p.phases[5].eventCursor = 1;
    expect(lifecycleVerdict(p, true).verdict).toBe('INCONCLUSIVE');
    expect(messageRecoveryVerdict(p, false).verdict).toBe('INCONCLUSIVE');
  },
);
