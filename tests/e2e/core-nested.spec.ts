import { expect } from '@playwright/test';
import { createMV3Test } from '../../src/core/index.js';

const test = createMV3Test({ extensionPath: 'test-extensions/nested-worker' });

test('loads a worker from a nested extension path', async ({ extension }) => {
  expect(extension.workerURL).toBe(`chrome-extension://${extension.id}/nested/sw.js`);
  const page = await extension.newExtensionPage('probe.html');
  const reply = await page.evaluate(async () => chrome.runtime.sendMessage({ type: 'ping' }));
  expect(reply).toMatchObject({ ok: true });
  expect(typeof reply.bootId).toBe('string');
});
