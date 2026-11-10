import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectExtension } from '../../src/core/manifest.js';
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

describe('Chromium manifest dialect and extension path', () => {
  async function build(manifestText: string, name = 'ext') {
    const root = await mkdtemp(join(tmpdir(), 'mv3-dialect-'));
    const path = join(root, name);
    await mkdir(path);
    await writeFile(join(path, 'sw.js'), '// fixture');
    await writeFile(join(path, 'manifest.json'), manifestText);
    return { root, path };
  }
  const body = '"manifest_version": 3, "name": "Test", "version": "1", "background": { "service_worker": "sw.js" }';
  it('accepts a UTF-8 BOM and comments like Chromium, keeping "//" inside strings', async () => {
    const { root, path } = await build(
      `﻿// dev build\n{ ${body}, /* block */ "homepage_url": "https://example.com//docs/*x*/" }`);
    try {
      const { manifest } = await inspectExtension(path);
      expect((manifest as unknown as { homepage_url: string }).homepage_url).toBe('https://example.com//docs/*x*/');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('still rejects what Chromium rejects: trailing commas and unterminated comments', async () => {
    for (const text of [`{ ${body}, }`, `{ ${body} } /* open`]) {
      const { root, path } = await build(text);
      try { await expect(inspectExtension(path)).rejects.toMatchObject({ code: 'MANIFEST_UNREADABLE' }); }
      finally { await rm(root, { recursive: true, force: true }); }
    }
  });
  it('rejects an extension path containing a comma, which Chromium would split', async () => {
    const { root, path } = await build(`{ ${body} }`, 'Clients, 2026');
    try { await expect(inspectExtension(path)).rejects.toMatchObject({ code: 'EXTENSION_PATH' }); }
    finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe('Chromium-compatible manifest fields', () => {
  async function load(text: string) {
    const root = await mkdtemp(join(tmpdir(), 'mv3-compat-'));
    await writeFile(join(root, 'sw.js'), '// fixture');
    await writeFile(join(root, 'manifest.json'), text);
    try { return await inspectExtension(root); } finally { await rm(root, { recursive: true, force: true }); }
  }
  it('accepts a classic worker type, \\xNN escapes and raw line breaks in strings, as Chromium does', async () => {
    const { manifest } = await load('{ "manifest_version": 3, "name": "a\\x41 \\\\x41", "version": "1",\n'
      + '"description": "line one\nline two", "background": { "service_worker": "sw.js", "type": "classic" } }');
    expect(manifest.name).toBe('aA \\x41');
    expect((manifest as unknown as { description: string }).description).toBe('line one\nline two');
    expect(manifest.background.type).toBe('classic');
  });
  it('still rejects unknown worker types', async () => {
    await expect(load('{ "manifest_version": 3, "name": "a", "version": "1", "background": { "service_worker": "sw.js", "type": "shared" } }'))
      .rejects.toMatchObject({ code: 'WORKER_TYPE' });
  });
});
