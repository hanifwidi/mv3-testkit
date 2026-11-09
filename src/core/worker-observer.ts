export interface CDPWorkerVersion {
  versionId: string;
  registrationId?: string;
  scriptURL: string;
  runningStatus: string;
}

export interface WorkerStatusEvent {
  at: string;
  status: string;
  versionId: string;
  registrationId?: string;
}

export class WorkerTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerTransitionError';
  }
}

/**
 * Observes CDP status updates for one exact worker script.
 * A transition must be observed after its trigger, not inferred from an old status.
 */
export class WorkerTransitionObserver {
  readonly events: WorkerStatusEvent[] = [];
  private latest = new Map<string, WorkerStatusEvent>();
  private listeners = new Set<() => void>();

  constructor(readonly scriptURL: string) {}

  observe(versions: readonly CDPWorkerVersion[]) {
    for (const v of versions) {
      if (v.scriptURL !== this.scriptURL || !v.versionId) continue;
      const event: WorkerStatusEvent = {
        at: new Date().toISOString(), status: v.runningStatus,
        versionId: v.versionId, registrationId: v.registrationId,
      };
      this.latest.set(v.versionId, event);
      this.events.push(event);
    }
    for (const listener of [...this.listeners]) listener();
  }

  /** Index of the next event, used to exclude pre-trigger status snapshots. */
  get cursor(): number { return this.events.length; }

  waitFor(status: string, options: {
    versionId?: string;
    after?: number;
    timeoutMs?: number;
  } = {}): Promise<WorkerStatusEvent> {
    const after = options.after ?? 0;
    const timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isSafeInteger(after) || after < 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0 ||
      timeoutMs > 2_147_483_647) {
      throw new RangeError('Invalid worker observation cursor or timeout');
    }
    return new Promise((resolve, reject) => {
      const check = () => {
        const match = this.events.slice(after).find(e =>
          e.status === status &&
          (!options.versionId || e.versionId === options.versionId) &&
          this.latest.get(e.versionId)?.status === status);
        if (match) {
          clearTimeout(timer);
          this.listeners.delete(check);
          resolve(match);
        }
      };
      const timer = setTimeout(() => {
        this.listeners.delete(check);
        reject(new WorkerTransitionError(`No observed ${status} transition for ${this.scriptURL}`));
      }, timeoutMs);
      this.listeners.add(check);
      check();
    });
  }
}
