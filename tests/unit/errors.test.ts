import { expect, it } from 'vitest';
import { diagnoseError, MV3RuntimeError } from '../../src/core/errors.js';
import { MV3ContextError } from '../../src/core/page-helpers.js';
import { LifecycleUnverifiedError } from '../../src/core/lifecycle.js';
import type { LifecycleEvidence } from '../../src/core/diagnostics.js';

// Infrastructure faults must stay INCONCLUSIVE (exit 2); only build defects are FAIL (exit 1).
it('maps storage-read failures to INCONCLUSIVE and other context misuse to FAIL', () => {
  expect(diagnoseError(new MV3ContextError('MV3_STORAGE_READ_FAILED', 'timed out'))).toMatchObject({ verdict: 'INCONCLUSIVE' });
  for (const code of ['MV3_PAGE_ENTRY_NOT_FOUND', 'MV3_STORAGE_CONTEXT_INVALID', 'MV3_STORAGE_KEYS_INVALID', 'MV3_STORAGE_PERMISSION_MISSING'] as const)
    expect(diagnoseError(new MV3ContextError(code, 'x'))).toMatchObject({ verdict: 'FAIL', code });
});
it('maps runtime faults to INCONCLUSIVE except a worker Chrome rejected', () => {
  for (const code of ['MV3_CHROMIUM_UNAVAILABLE', 'MV3_CHROMIUM_LAUNCH_FAILED', 'MV3_EXTENSION_LOAD_TIMEOUT', 'MV3_EXTENSION_LOAD_FAILED'] as const)
    expect(diagnoseError(new MV3RuntimeError(code, 'x'))).toMatchObject({ verdict: 'INCONCLUSIVE', code });
  expect(diagnoseError(new MV3RuntimeError('MV3_WORKER_REGISTRATION_FAILED', 'x'))).toMatchObject({ verdict: 'FAIL' });
});
it('keeps an operation-plus-cleanup failure INCONCLUSIVE, even with a FAIL-class cause, and keeps evidence', () => {
  const evidence = { runId: 'r' } as LifecycleEvidence;
  const aggregate = new AggregateError([
    new MV3RuntimeError('MV3_WORKER_REGISTRATION_FAILED', 'worker failed'),
    new LifecycleUnverifiedError('restart unverified', { evidence }),
    new Error('detach failed'),
  ], 'operation and cleanup failed');
  expect(diagnoseError(aggregate)).toMatchObject({
    verdict: 'INCONCLUSIVE', code: 'MV3_OPERATION_AND_CLEANUP_FAILED', evidence,
    message: expect.stringContaining('detach failed'),
  });
});
it('treats unknown errors as INCONCLUSIVE', () => {
  expect(diagnoseError('boom')).toMatchObject({ verdict: 'INCONCLUSIVE', code: 'MV3_UNEXPECTED_ERROR' });
});
