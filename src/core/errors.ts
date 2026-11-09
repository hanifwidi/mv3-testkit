import { MV3ConfigError } from './config.js';
import { MV3PreflightError } from './manifest.js';
import type { Diagnostic } from './diagnostics.js';
import { LifecycleUnverifiedError } from './lifecycle.js';
import { MV3ContextError } from './page-helpers.js';

export class MV3RuntimeError extends Error {
  constructor(readonly code: 'MV3_CHROMIUM_UNAVAILABLE' | 'MV3_CHROMIUM_LAUNCH_FAILED' | 'MV3_EXTENSION_LOAD_TIMEOUT' | 'MV3_EXTENSION_LOAD_FAILED',
    message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MV3RuntimeError';
  }
}

export function diagnoseError(error: unknown): Diagnostic {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof MV3ConfigError)
    return { verdict: 'FAIL', code: `MV3_${error.code}`, message };
  if (error instanceof MV3PreflightError)
    return { verdict: 'FAIL', code: error.code.startsWith('PAGE_') ? 'MV3_PAGE_ENTRY_NOT_FOUND' :
      error.code === 'WORKER_MISSING' ? 'MV3_WORKER_MISSING' : 'MV3_MANIFEST_INVALID', message };
  if (error instanceof MV3RuntimeError)
    return { verdict: 'INCONCLUSIVE', code: error.code, message };
  if (error instanceof LifecycleUnverifiedError)
    return { verdict: 'INCONCLUSIVE', code: 'MV3_LIFECYCLE_UNVERIFIED', message, evidence: error.evidence };
  if (error instanceof MV3ContextError)
    return { verdict: error.code === 'MV3_STORAGE_READ_FAILED' ? 'INCONCLUSIVE' : 'FAIL', code: error.code, message };
  if (error instanceof AggregateError) {
    const causes = error.errors.map(cause => diagnoseError(cause));
    return { verdict: 'INCONCLUSIVE', code: 'MV3_OPERATION_AND_CLEANUP_FAILED',
      message: [message, ...causes.map(cause => cause.message)].join('; '),
      evidence: causes.find(cause => cause.evidence)?.evidence };
  }
  return { verdict: 'INCONCLUSIVE', code: 'MV3_UNEXPECTED_ERROR', message };
}
