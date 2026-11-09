import { RESTART_STATES, type LifecyclePhase } from './lifecycle-state.js';

export type DiagnosticVerdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

export interface LifecycleEvidence {
  runId: string;
  testId?: string;
  startedAt: string;
  extensionId: string;
  browserVersion?: string;
  driver: 'experimental-cdp-stopWorker';
  phases: LifecyclePhase[];
  workerScriptURL: string;
  initialVersionId: string;
  finalVersionId?: string;
  stopped: boolean;
  restarted: boolean;
  identityChanged: boolean;
  events: Array<{ at: string; status: string; versionId: string; registrationId?: string }>;
}

export interface Diagnostic {
  verdict: DiagnosticVerdict;
  code: string;
  message: string;
  evidence?: LifecycleEvidence;
}

/**
 * A diagnostic cannot pass from caller-supplied booleans alone.
 * Validate the recorded stop-then-running sequence for the exact version.
 */
function verifiedRestart(evidence: LifecycleEvidence): boolean {
  const initial = evidence.initialVersionId;
  const events = evidence.events;
  const phases = evidence.phases;
  if (!Array.isArray(events) || !Array.isArray(phases) || phases.length !== RESTART_STATES.length ||
    !phases.every((p, i) => p.state === RESTART_STATES[i] && Number.isSafeInteger(p.eventCursor) &&
      p.eventCursor >= 0 && p.eventCursor <= events.length &&
      (i === 0 ? p.eventCursor === 0 : p.eventCursor >= phases[i - 1].eventCursor))) return false;
  const cursor = (state: typeof RESTART_STATES[number]) => phases[RESTART_STATES.indexOf(state)].eventCursor;
  const initialAt = events.findIndex((e, i) => i >= cursor('STARTING') && i < cursor('RUNNING') &&
    e.status === 'running' && e.versionId === initial);
  const stopAt = events.findIndex((e, i) => i >= cursor('STOP_REQUESTED') && i < cursor('STOPPED_OBSERVED') &&
    e.status === 'stopped' && e.versionId === initial);
  const resumedAt = events.findIndex((e, i) =>
    i >= cursor('EVENT_TRIGGERED') && i < cursor('RUNNING_AGAIN') &&
    i > stopAt && e.status === 'running' && e.versionId === initial);
  return !!initial && evidence.finalVersionId === initial &&
    evidence.stopped && evidence.restarted && evidence.identityChanged &&
    initialAt >= 0 && stopAt > initialAt && resumedAt > stopAt;
}

function unverified(evidence: LifecycleEvidence): Diagnostic {
  return { verdict: 'INCONCLUSIVE', code: 'LIFECYCLE_UNVERIFIED',
    message: 'Missing ordered phases, matching worker transitions or new boot evidence', evidence };
}

export function lifecycleVerdict(evidence: LifecycleEvidence, statePreserved: boolean): Diagnostic {
  if (!verifiedRestart(evidence)) return unverified(evidence);
  return statePreserved
    ? { verdict: 'PASS', code: 'STATE_PRESERVED', message: 'State survived a verified worker restart', evidence }
    : { verdict: 'FAIL', code: 'STATE_LOST', message: 'State changed after a verified worker restart', evidence };
}

export function messageRecoveryVerdict(evidence: LifecycleEvidence, recovered: boolean): Diagnostic {
  if (!verifiedRestart(evidence)) return unverified(evidence);
  return recovered
    ? { verdict: 'PASS', code: 'MESSAGE_RECOVERED', message: 'Messaging worked after a verified worker restart', evidence }
    : { verdict: 'FAIL', code: 'MESSAGE_NOT_RECOVERED', message: 'Messaging failed after a verified worker restart', evidence };
}
