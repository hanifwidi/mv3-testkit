import { beforeEach, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { doctor } from '../../src/core/doctor.js';
import { launchExtension, type LoadedExtension } from '../../src/core/loader.js';
import { MV3RuntimeError } from '../../src/core/errors.js';
import { main } from '../../src/cli/index.js';

// Integration of real preflight, doctor, CLI and taxonomy with a fake browser adapter.
// These tests are not real-browser lifecycle evidence.
vi.mock('../../src/core/loader.js', () => ({ launchExtension: vi.fn() }));
const fixture = resolve('test-extensions/healthy-counter');
const id = 'a'.repeat(32);
const close = vi.fn(async () => {});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(launchExtension).mockResolvedValue({
    id, workerURL: `chrome-extension://${id}/background.js`, close,
    context: { browser: () => ({ version: () => '158.0.8127.18' }) },
  } as unknown as LoadedExtension);
});

it('verifies real fixture preflight, uses the launcher, and closes it before a PASS', async () => {
  const report = await doctor({ extensionPath: fixture });
  expect(report).toMatchObject({ verdict: 'PASS', code: 'MV3_READY', extensionId: id,
    checks: [{ name: 'manifest', passed: true }, { name: 'browser-and-worker', passed: true }] });
  expect(close).toHaveBeenCalledOnce();
});
it('fails unreadable manifests before attempting a browser launch', async () => {
  expect(await doctor({ extensionPath: '/tmp/mv3-does-not-exist/extension' }))
    .toMatchObject({ verdict: 'FAIL', code: 'MV3_MANIFEST_INVALID' });
  expect(launchExtension).not.toHaveBeenCalled();
});
it.each(['MV3_CHROMIUM_UNAVAILABLE', 'MV3_EXTENSION_LOAD_TIMEOUT'] as const)(
  'reports %s as INCONCLUSIVE', async code => {
    vi.mocked(launchExtension).mockRejectedValue(new MV3RuntimeError(code, 'diagnostic'));
    expect(await doctor({ extensionPath: fixture })).toMatchObject({ verdict: 'INCONCLUSIVE', code });
  },
);
it('refuses a PASS after cleanup failure', async () => {
  close.mockRejectedValue(new Error('cannot close browser'));
  expect(await doctor({ extensionPath: fixture })).toMatchObject({ verdict: 'INCONCLUSIVE', code: 'MV3_CLEANUP_FAILED' });
});
it('CLI JSON and exit code reflect verified readiness', async () => {
  const lines: string[] = [];
  expect(await main(['doctor', '--extension', fixture], text => lines.push(text))).toBe(0);
  expect(JSON.parse(lines[0])).toMatchObject({ verdict: 'PASS', code: 'MV3_READY', extensionId: id });
});
it('CLI returns exit 2 for unavailable Chromium', async () => {
  vi.mocked(launchExtension).mockRejectedValue(new MV3RuntimeError('MV3_CHROMIUM_UNAVAILABLE', 'missing'));
  const lines: string[] = [];
  expect(await main(['doctor', '--extension', fixture], text => lines.push(text))).toBe(2);
  expect(JSON.parse(lines[0]).verdict).toBe('INCONCLUSIVE');
});
it('CLI help describes limits without attempting browser launch', async () => {
  const lines: string[] = [];
  expect(await main(['doctor', '--help'], text => lines.push(text))).toBe(0);
  expect(lines[0]).toContain('INCONCLUSIVE');
  expect(launchExtension).not.toHaveBeenCalled();
});
it.each([[], ['init'], ['doctor'], ['doctor', '--unknown', '.'], ['doctor', '--extension', '.', '--config', 'x.json']])(
  'CLI rejects unsupported/malformed arguments: %j', async (...args: string[]) => {
    // Vitest spreads array cases into parameters.
    const lines: string[] = [];
    expect(await main(args, text => lines.push(text))).toBe(1);
    expect(JSON.parse(lines[0]).code).toBe('MV3_CONFIG_INVALID');
    expect(launchExtension).not.toHaveBeenCalled();
  },
);
