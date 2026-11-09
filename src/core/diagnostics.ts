export type DiagnosticVerdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

export interface LifecycleEvidence {
  workerScriptURL: string;
  initialVersionId: string;
  finalVersionId?: string;
  stopped: boolean;
  restarted: boolean;
  identityChanged: boolean;
  events: Array<{ at: string; status: string; versionId: string }>;
}

export interface Diagnostic {
  verdict: DiagnosticVerdict;
  code: string;
  message: string;
  evidence?: LifecycleEvidence;
}

export function lifecycleVerdict(evidence: LifecycleEvidence, statePreserved: boolean): Diagnostic {
  if (!evidence.stopped || !evidence.restarted || !evidence.identityChanged) {
    return { verdict: 'INCONCLUSIVE', code: 'LIFECYCLE_UNVERIFIED',
      message: 'Worker stop, restart, or new boot identity not verified', evidence };
  }
  return statePreserved
    ? { verdict: 'PASS', code: 'STATE_PRESERVED', message: 'State survived a verified worker restart', evidence }
    : { verdict: 'FAIL', code: 'STATE_LOST', message: 'State changed after a verified worker restart', evidence };
}
