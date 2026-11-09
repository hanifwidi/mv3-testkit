export type DiagnosticVerdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

export interface LifecycleEvidence {
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
export function lifecycleVerdict(evidence: LifecycleEvidence, statePreserved: boolean): Diagnostic {
  const initial = evidence.initialVersionId;
  const events = evidence.events;
  const stopAt = events.findIndex(e => e.status === 'stopped' && e.versionId === initial);
  const resumedAt = events.findIndex((e, i) =>
    i > stopAt && e.status === 'running' && e.versionId === initial);
  const verified = !!initial && evidence.finalVersionId === initial &&
    evidence.stopped && evidence.restarted && evidence.identityChanged &&
    stopAt >= 0 && resumedAt > stopAt;

  if (!verified) {
    return {
      verdict: 'INCONCLUSIVE',
      code: 'LIFECYCLE_UNVERIFIED',
      message: 'Missing matching worker stop, restart, or new boot evidence',
      evidence,
    };
  }
  return statePreserved
    ? { verdict: 'PASS', code: 'STATE_PRESERVED', message: 'State survived a verified worker restart', evidence }
    : { verdict: 'FAIL', code: 'STATE_LOST', message: 'State changed after a verified worker restart', evidence };
}
