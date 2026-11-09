import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectExtension, MV3PreflightError } from '../../src/core/manifest.js';
import { lifecycleVerdict, type LifecycleEvidence } from '../../src/core/diagnostics.js';

const evidence: LifecycleEvidence = {
  runId: 'synthetic-unit-test', driver: 'experimental-cdp-stopWorker',
  startedAt: '2026-11-09T00:00:00Z', extensionId: 'a'.repeat(32),
  phases: [
    { state: 'UNDISCOVERED', at: '2026-11-09T00:00:00Z', eventCursor: 0 },
    { state: 'STARTING', at: '2026-11-09T00:00:00Z', eventCursor: 0 },
    { state: 'RUNNING', at: '2026-11-09T00:00:00Z', eventCursor: 1 },
    { state: 'STOP_REQUESTED', at: '2026-11-09T00:00:01Z', eventCursor: 1 },
    { state: 'STOPPED_OBSERVED', at: '2026-11-09T00:00:01Z', eventCursor: 2 },
    { state: 'EVENT_TRIGGERED', at: '2026-11-09T00:00:01Z', eventCursor: 2 },
    { state: 'RUNNING_AGAIN', at: '2026-11-09T00:00:02Z', eventCursor: 3 },
  ],
  workerScriptURL: 'chrome-extension://' + 'a'.repeat(32) + '/worker.js',
  initialVersionId: 'version-1', finalVersionId: 'version-1',
  stopped: true, restarted: true, identityChanged: true, events: [
    { at: '2026-11-09T00:00:00Z', status: 'running', versionId: 'version-1' },
    { at: '2026-11-09T00:00:01Z', status: 'stopped', versionId: 'version-1' },
    { at: '2026-11-09T00:00:02Z', status: 'running', versionId: 'version-1' },
  ],
};
describe('diagnostics', () => {
  it('uses state-specific diagnostic codes', () => {
    expect(lifecycleVerdict(evidence, true).code).toBe('STATE_PRESERVED');
    expect(lifecycleVerdict(evidence, false).code).toBe('STATE_LOST');
  });
  it('rejects impossible or fabricated event sequences', () => {
    expect(lifecycleVerdict({ ...evidence, events: [] }, true).verdict).toBe('INCONCLUSIVE');
    expect(lifecycleVerdict({ ...evidence, finalVersionId: 'version-2' }, true).verdict).toBe('INCONCLUSIVE');
    expect(lifecycleVerdict({ ...evidence, events: evidence.events.filter(e => e.status !== 'stopped') }, true).verdict).toBe('INCONCLUSIVE');
  });
  it('never passes incomplete worker evidence', () => {
    expect(lifecycleVerdict({ ...evidence, restarted: false }, true).verdict).toBe('INCONCLUSIVE');
    expect(lifecycleVerdict({ ...evidence, identityChanged: false }, false).verdict).toBe('INCONCLUSIVE');
  });
});

describe('MV3 manifest preflight', () => {
  async function fixture(worker: string, manifestOverride: Record<string, unknown> = {}) {
    const path = await mkdtemp(join(tmpdir(), 'mv3-preflight-'));
    await mkdir(join(path, 'nested'));
    await writeFile(join(path, 'nested', 'sw.js'), '// fixture');
    await writeFile(join(path, 'manifest.json'), JSON.stringify({
      manifest_version: 3, name: 'Test', version: '0.0.1',
      background: { service_worker: worker }, ...manifestOverride,
    }));
    return path;
  }
  it('accepts nested worker entries, not just background.js', async () => {
    const path = await fixture('nested/sw.js');
    try { expect((await inspectExtension(path)).workerPath).toBe('nested/sw.js'); }
    finally { await rm(path, { recursive: true, force: true }); }
  });
  it('rejects incompatible manifest versions', async () => {
    const path = await fixture('nested/sw.js', { manifest_version: 2 });
    try { await expect(inspectExtension(path)).rejects.toMatchObject({ code: 'MANIFEST_VERSION' }); }
    finally { await rm(path, { recursive: true, force: true }); }
  });
  it('rejects paths escaping an extension', async () => {
    const path = await fixture('../outside.js');
    try { await expect(inspectExtension(path)).rejects.toMatchObject({ code: 'WORKER_PATH' }); }
    finally { await rm(path, { recursive: true, force: true }); }
  });
  it('rejects malformed permissions', async () => {
    const path = await fixture('nested/sw.js', { permissions: 'storage' });
    try { await expect(inspectExtension(path)).rejects.toMatchObject({ code: 'MANIFEST_PERMISSIONS' }); }
    finally { await rm(path, { recursive: true, force: true }); }
  });
  it('rejects non-normalized worker paths', async () => {
    const path = await fixture('nested//sw.js');
    try { await expect(inspectExtension(path)).rejects.toMatchObject({ code: 'WORKER_PATH' }); }
    finally { await rm(path, { recursive: true, force: true }); }
  });
  it('rejects missing workers', async () => {
    const path = await fixture('missing.js');
    try { await expect(inspectExtension(path)).rejects.toMatchObject({ code: 'WORKER_UNREADABLE' }); }
    finally { await rm(path, { recursive: true, force: true }); }
  });
  it('rejects worker symlinks that escape the extension root', async () => {
    const path = await fixture('nested/sw.js');
    const outside = await mkdtemp(join(tmpdir(), 'mv3-preflight-outside-'));
    try {
      await writeFile(join(outside, 'sw.js'), '// fixture');
      await rm(join(path, 'nested/sw.js'));
      await symlink(join(outside, 'sw.js'), join(path, 'nested/sw.js'));
      await expect(inspectExtension(path)).rejects.toMatchObject({ code: 'WORKER_PATH' });
    } finally {
      await rm(path, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
