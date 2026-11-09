import type { CDPSession, Page } from '@playwright/test';
import type { LifecycleEvidence } from './diagnostics.js';
import { WorkerTransitionObserver, type CDPWorkerVersion } from './worker-observer.js';

export class LifecycleUnverifiedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LifecycleUnverifiedError';
  }
}

export interface RestartOptions {
  workerURL: string;
  trigger: () => Promise<void>;
  getBootIdentity: () => Promise<string>;
  timeoutMs?: number;
}

function bounded<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    operation,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new LifecycleUnverifiedError(`Timed out: ${label}`)), timeoutMs);
    }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

/**
 * Experimental forced-stop CDP implementation. A matching worker must emit
 * fresh stopped and running transitions. A replaced registration/version is
 * unsupported and explicitly INCONCLUSIVE, not a successful restart.
 */
export async function observeWorkerRestart(session: CDPSession, options: RestartOptions): Promise<LifecycleEvidence> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('timeoutMs must be positive');
  if (!/^chrome-extension:\/\/[a-p]{32}\/.+/.test(options.workerURL)) {
    throw new LifecycleUnverifiedError('Expected a concrete chrome-extension worker URL');
  }

  const observer = new WorkerTransitionObserver(options.workerURL);
  const evidence: LifecycleEvidence = {
    workerScriptURL: options.workerURL,
    initialVersionId: '',
    stopped: false, restarted: false, identityChanged: false,
    events: observer.events,
  };
  const onUpdated = (payload: { versions: CDPWorkerVersion[] }) => observer.observe(payload.versions);
  session.on('ServiceWorker.workerVersionUpdated', onUpdated);
  try {
    await bounded(session.send('ServiceWorker.enable'), timeoutMs, 'ServiceWorker.enable');
    const initial = await observer.waitFor('running', { timeoutMs });
    evidence.initialVersionId = initial.versionId;
    const beforeBootId = await bounded(Promise.resolve().then(options.getBootIdentity), timeoutMs, 'initial boot identity');
    if (typeof beforeBootId !== 'string' || !beforeBootId) throw new LifecycleUnverifiedError('Missing initial boot identity');

    // Capture the cursor BEFORE sending stop: CDP may emit stopped during send.
    const stopCursor = observer.cursor;
    await bounded(session.send('ServiceWorker.stopWorker', { versionId: initial.versionId }), timeoutMs, 'ServiceWorker.stopWorker');
    const stopped = await observer.waitFor('stopped', { versionId: initial.versionId, after: stopCursor, timeoutMs });
    if (initial.registrationId && stopped.registrationId && initial.registrationId !== stopped.registrationId) {
      throw new LifecycleUnverifiedError('Worker registration changed while stopping');
    }
    evidence.stopped = true;

    // Capture before trigger: asynchronous runtime messages can restart immediately.
    const restartCursor = observer.cursor;
    await bounded(Promise.resolve().then(options.trigger), timeoutMs, 'restart trigger');
    const resumed = await observer.waitFor('running', { versionId: initial.versionId, after: restartCursor, timeoutMs });
    if (initial.registrationId && resumed.registrationId && initial.registrationId !== resumed.registrationId) {
      throw new LifecycleUnverifiedError('Worker registration changed during restart');
    }
    evidence.finalVersionId = resumed.versionId;
    evidence.restarted = true;
    const afterBootId = await bounded(Promise.resolve().then(options.getBootIdentity), timeoutMs, 'restarted boot identity');
    evidence.identityChanged = typeof afterBootId === 'string' && !!afterBootId && beforeBootId !== afterBootId;
    if (!evidence.identityChanged) throw new LifecycleUnverifiedError('Worker boot identity did not change');
    return evidence;
  } finally {
    session.off('ServiceWorker.workerVersionUpdated', onUpdated);
  }
}

/**
 * Opens a short-lived page-bound CDP observer. Never attaches to the worker
 * debugger, which would interfere with natural worker lifetime.
 */
export async function forceWorkerRestart(options: RestartOptions & { page: Page }): Promise<LifecycleEvidence> {
  const session = await options.page.context().newCDPSession(options.page);
  let failure: unknown;
  try {
    return await observeWorkerRestart(session, options);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try {
      await session.detach();
    } catch (cleanupError) {
      if (!failure) throw cleanupError;
      // Keep both failures observable: do not replace the root cause.
      throw new AggregateError([failure, cleanupError], 'Worker lifecycle and CDP cleanup both failed');
    }
  }
}
