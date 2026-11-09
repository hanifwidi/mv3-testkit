import { EventEmitter } from 'node:events';
import type { CDPSession, Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { forceWorkerRestart, observeWorkerRestart, LifecycleUnverifiedError } from '../../src/core/lifecycle.js';
import { WorkerTransitionObserver } from '../../src/core/worker-observer.js';
import { extensionPageURL } from '../../src/core/loader.js';

const id = 'a'.repeat(32);
const workerURL = `chrome-extension://${id}/background.js`;

class FakeCDP extends EventEmitter {
  version = 'v1';
  registration = 'r1';
  boot = 'boot-1';
  emitStopped = true;
  emitRestarted = true;
  replaceVersion = false;
  changeRegistration = false;
  async send(method: string) {
    if (method === 'ServiceWorker.enable') {
      this.workerStatus('running');
    } else if (method === 'ServiceWorker.stopWorker') {
      if (this.emitStopped) this.workerStatus('stopped', this.changeRegistration ? 'r2' : this.registration);
    } else {
      throw new Error(`Unexpected CDP command: ${method}`);
    }
  }
  workerStatus(status: string, registrationId = this.registration) {
    this.emit('ServiceWorker.workerVersionUpdated', {
      versions: [{ versionId: this.version, scriptURL: workerURL, runningStatus: status, registrationId }],
    });
  }
  restart() {
    this.boot = 'boot-2';
    if (this.replaceVersion) this.version = 'v2';
    if (this.emitRestarted) this.workerStatus('running');
  }
}
const observed = (cdp: FakeCDP, trigger?: () => Promise<void>) =>
  observeWorkerRestart(cdp as unknown as CDPSession, {
    workerURL,
    timeoutMs: 40,
    getBootIdentity: async () => cdp.boot,
    trigger: trigger ?? (async () => { cdp.restart(); }),
  });

describe('CDP worker observer', () => {
  it('does not reuse stale running status after a stop', async () => {
    const o = new WorkerTransitionObserver(workerURL);
    o.observe([{ scriptURL: workerURL, versionId: 'v1', runningStatus: 'running' }]);
    const cursor = o.cursor;
    o.observe([{ scriptURL: workerURL, versionId: 'v1', runningStatus: 'stopped' }]);
    await expect(o.waitFor('running', { versionId: 'v1', after: cursor, timeoutMs: 10 }))
      .rejects.toThrow(/No observed running/);
    o.observe([{ scriptURL: workerURL, versionId: 'v1', runningStatus: 'running' }]);
    const result = await o.waitFor('running', { versionId: 'v1', after: cursor, timeoutMs: 10 });
    expect(result.versionId).toBe('v1');
  });
  it('ignores other extension scripts', async () => {
    const o = new WorkerTransitionObserver(workerURL);
    o.observe([{ scriptURL: `chrome-extension://${'b'.repeat(32)}/background.js`, versionId: 'v1', runningStatus: 'running' }]);
    expect(o.events).toHaveLength(0);
  });
});

describe('forced worker restart', () => {
  it('accepts observed stop, restart, and changed boot identity', async () => {
    const result = await observed(new FakeCDP());
    expect(result).toMatchObject({ stopped: true, restarted: true, identityChanged: true, initialVersionId: 'v1', finalVersionId: 'v1' });
  });
  it('rejects missing stop event', async () => {
    const cdp = new FakeCDP();
    cdp.emitStopped = false;
    let failure: unknown;
    try { await observed(cdp); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(LifecycleUnverifiedError);
    const evidence = (failure as LifecycleUnverifiedError).evidence;
    expect(evidence?.stopped).toBe(false);
    expect(evidence?.phases.map(p => p.state)).toEqual([
      'UNDISCOVERED', 'STARTING', 'RUNNING', 'STOP_REQUESTED', 'INCONCLUSIVE',
    ]);
    expect(cdp.listenerCount('ServiceWorker.workerVersionUpdated')).toBe(0);
  });
  it('rejects missing restart event despite a fresh boot identity', async () => {
    const cdp = new FakeCDP();
    cdp.emitRestarted = false;
    await expect(observed(cdp)).rejects.toThrow(/No observed running/);
  });
  it('rejects worker version replacement, not misclassifying it as restart', async () => {
    const cdp = new FakeCDP();
    cdp.replaceVersion = true;
    await expect(observed(cdp)).rejects.toThrow(/No observed running/);
  });
  it('rejects registration changes', async () => {
    const cdp = new FakeCDP();
    cdp.changeRegistration = true;
    await expect(observed(cdp)).rejects.toThrow(/registration changed/);
  });
  it('bounds an unresolved restart trigger', async () => {
    await expect(observed(new FakeCDP(), () => new Promise<void>(() => {})))
      .rejects.toThrow(/Timed out: restart trigger/);
  });
  it('rejects a boot identity that did not change', async () => {
    const cdp = new FakeCDP();
    await expect(observed(cdp, async () => { cdp.workerStatus('running'); }))
      .rejects.toThrow(/boot identity did not change/);
  });
  it('rejects invalid timeout and worker script URL', async () => {
    const cdp = new FakeCDP();
    await expect(observeWorkerRestart(cdp as unknown as CDPSession, {
      workerURL, timeoutMs: -1, trigger: async () => {}, getBootIdentity: async () => 'first',
    })).rejects.toThrow(/timeoutMs/);
    await expect(observeWorkerRestart(cdp as unknown as CDPSession, {
      workerURL: 'https://example.com/sw.js', timeoutMs: 20,
      trigger: async () => {}, getBootIdentity: async () => 'first',
    })).rejects.toThrow(/chrome-extension/);
  });
});

describe('extension page path validation', () => {
  it('allows nested extension pages', () => {
    expect(extensionPageURL(id, 'options/settings.html')).toBe(`chrome-extension://${id}/options/settings.html`);
  });
  it.each(['', '/', '//evil.example/', '../outside.html', './popup.html', 'a//b.html',
    'popup.html?source=external', 'popup.html#fragment', '%2f%2fevil.example', 'back\\slash.html'])(
    'rejects unsafe extension-local path %s', path => {
      expect(() => extensionPageURL(id, path)).toThrow();
    },
  );
});

describe('page-bound CDP cleanup', () => {
  it('makes a post-restart detach failure INCONCLUSIVE with retained evidence', async () => {
    const cdp = Object.assign(new FakeCDP(), { detach: vi.fn(async () => { throw new Error('detach failed'); }) });
    const page = { context: () => ({ newCDPSession: async () => cdp }) } as unknown as Page;
    let failure: unknown;
    try {
      await forceWorkerRestart({ page, workerURL, timeoutMs: 40,
        trigger: async () => { cdp.restart(); }, getBootIdentity: async () => cdp.boot });
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(LifecycleUnverifiedError);
    expect((failure as LifecycleUnverifiedError).evidence?.phases.at(-1)?.state).toBe('INCONCLUSIVE');
  });
  it('detaches and removes listeners after a verified restart', async () => {
    const cdp = Object.assign(new FakeCDP(), { detach: vi.fn(async () => {}) });
    const page = { context: () => ({ newCDPSession: async () => cdp }) } as unknown as Page;
    expect(await forceWorkerRestart({ page, workerURL, timeoutMs: 40,
      trigger: async () => { cdp.restart(); }, getBootIdentity: async () => cdp.boot,
    })).toMatchObject({ stopped: true, restarted: true });
    expect(cdp.detach).toHaveBeenCalledOnce();
    expect(cdp.listenerCount('ServiceWorker.workerVersionUpdated')).toBe(0);
  });
  it('retains the operation failure and detach failure, even for a falsy rejection', async () => {
    const cleanupError = new Error('detach failed');
    const cdp = Object.assign(new FakeCDP(), { detach: vi.fn(async () => { throw cleanupError; }) });
    const page = { context: () => ({ newCDPSession: async () => cdp }) } as unknown as Page;
    await expect(forceWorkerRestart({ page, workerURL, timeoutMs: 40,
      trigger: async () => {}, getBootIdentity: async () => { throw undefined; },
    })).rejects.toMatchObject({ errors: [expect.objectContaining({ cause: undefined }), cleanupError] });
    expect(cdp.detach).toHaveBeenCalledOnce();
    expect(cdp.listenerCount('ServiceWorker.workerVersionUpdated')).toBe(0);
  });
});
