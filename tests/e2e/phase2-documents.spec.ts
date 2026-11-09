import { expect } from '@playwright/test';
import { createMV3Test, lifecycleVerdict, RESTART_STATES } from '../../src/core/index.js';
import { recordedRestart } from './phase2-evidence.js';

const test = createMV3Test({ extensionPath: 'test-extensions/popup-options' });

test('popup/options documents and allowlisted local/session storage survive a verified worker restart', async ({ extension }, info) => {
  const popup = await extension.openPopupDocument();
  const options = await extension.openOptionsDocument();
  await expect(popup.getByRole('heading')).toHaveText('Counter popup');
  await expect(options.getByRole('heading')).toHaveText('Counter options');
  expect(popup.url()).toBe(`chrome-extension://${extension.id}/popup.html`);
  expect(options.url()).toBe(`chrome-extension://${extension.id}/options.html`);
  await popup.evaluate(async () => {
    await chrome.storage.local.set({ counter: 7, secretMarker: 'test-only-omit-from-report' });
    await chrome.storage.session.set({ counter: 9 });
  });
  expect(await extension.readStorage(options, ['counter'])).toEqual({ counter: 7 });
  expect(await extension.readStorage(options, ['counter'], 'session')).toEqual({ counter: 9 });
  const ping = () => options.evaluate(async () => chrome.runtime.sendMessage({ type: 'ping' })) as Promise<{ ok: boolean; bootId: string }>;
  const before = await ping();
  const evidence = await recordedRestart({
    page: options, workerURL: extension.workerURL, testId: info.testId,
    trigger: async () => { await ping(); },
    getBootIdentity: async () => (await ping()).bootId,
  }, info);
  expect(evidence.phases.map(p => p.state)).toEqual([...RESTART_STATES]);
  expect(evidence.browserVersion).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  const local = await extension.readStorage(popup, ['counter']);
  const session = await extension.readStorage(options, ['counter'], 'session');
  const after = await ping();
  expect(after.bootId).not.toBe(before.bootId);
  const diagnostic = lifecycleVerdict(evidence, local.counter === 7 && session.counter === 9);
  expect(diagnostic).toMatchObject({ verdict: 'PASS', code: 'STATE_PRESERVED' });
  expect(local).toEqual({ counter: 7 });
  expect(session).toEqual({ counter: 9 });
  await info.attach('phase2-storage-restart', {
    body: JSON.stringify({ diagnostic, beforeBootId: before.bootId, afterBootId: after.bootId, local, session }, null, 2),
    contentType: 'application/json',
  });
  const outside = await extension.context.newPage();
  await expect(extension.readStorage(outside, ['counter']))
    .rejects.toMatchObject({ code: 'MV3_STORAGE_CONTEXT_INVALID' });
});
