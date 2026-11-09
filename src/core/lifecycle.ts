import type { CDPSession, Page } from '@playwright/test';
import type { LifecycleEvidence } from './diagnostics.js';

export class LifecycleUnverifiedError extends Error {
  constructor(message: string) { super(message); this.name = 'LifecycleUnverifiedError'; }
}

interface WorkerVersion {
  versionId: string;
  scriptURL: string;
  runningStatus: string;
}

const now = () => new Date().toISOString();

/** Experimental driver: deliberately stops a worker; does not simulate natural idle. */
export async function forceWorkerRestart(options: {
  page: Page;
  workerURL: string;
  trigger: () => Promise<void>;
  getBootIdentity: () => Promise<string>;
  timeoutMs?: number;
}): Promise<LifecycleEvidence> {
  const timeout = options.timeoutMs ?? 10_000;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('timeoutMs must be positive');
  const evidence: LifecycleEvidence = {
    workerScriptURL: options.workerURL, initialVersionId: '',
    stopped: false, restarted: false, identityChanged: false, events: [],
  };
  const session: CDPSession = await options.page.context().newCDPSession(options.page);
  const active = new Map<string, WorkerVersion>();
  const waiters = new Set<() => void>();
  const onUpdated = ({ versions }: { versions: WorkerVersion[] }) => {
    for (const version of versions) {
      if (version.scriptURL !== options.workerURL) continue;
      active.set(version.versionId, version);
      evidence.events.push({ at: now(), status: version.runningStatus, versionId: version.versionId });
    }
    for (const wake of [...waiters]) wake();
  };
  const awaitState = (status: string, versionId?: string, minIndex = 0): Promise<WorkerVersion> =>
    new Promise((accept, reject) => {
      const find = () => {
        const event = evidence.events.slice(minIndex).find(e =>
          e.status === status && (!versionId || e.versionId === versionId));
        if (!event) return;
        const value = active.get(event.versionId);
        if (!value) return;
        cleanup();
        accept({ ...value, versionId: event.versionId, runningStatus: event.status });
      };
      const timer = setTimeout(() => { cleanup(); reject(new LifecycleUnverifiedError(`No observed ${status} transition`)); }, timeout);
      const cleanup = () => { clearTimeout(timer); waiters.delete(find); };
      waiters.add(find);
      find();
    });
  session.on('ServiceWorker.workerVersionUpdated', onUpdated);
  try {
    await session.send('ServiceWorker.enable');
    const initial = await awaitState('running');
    const beforeBootId = await options.getBootIdentity();
    if (!beforeBootId) throw new LifecycleUnverifiedError('Empty boot identity');
    evidence.initialVersionId = initial.versionId;
    const transitionStart = evidence.events.length;
    await session.send('ServiceWorker.stopWorker', { versionId: initial.versionId });
    await awaitState('stopped', initial.versionId, transitionStart);
    evidence.stopped = true;
    const restartStart = evidence.events.length;
    await options.trigger();
    const resumed = await awaitState('running', undefined, restartStart);
    evidence.finalVersionId = resumed.versionId;
    evidence.restarted = true;
    const afterBootId = await options.getBootIdentity();
    evidence.identityChanged = !!afterBootId && beforeBootId !== afterBootId;
    if (!evidence.identityChanged) throw new LifecycleUnverifiedError('Boot identity did not change');
    return evidence;
  } finally {
    session.off('ServiceWorker.workerVersionUpdated', onUpdated);
    await session.detach();
  }
}
