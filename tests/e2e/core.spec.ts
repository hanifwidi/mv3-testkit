import { expect } from '@playwright/test';
import { createMV3Test, forceWorkerRestart, lifecycleVerdict } from '../../src/core/index.js';

const test = createMV3Test({ extensionPath: 'test-extensions/healthy-counter' });

test('public fixture loads the extension and verifies its worker', async ({ extension }) => {
  expect(extension.id).toMatch(/^[a-p]{32}$/);
  expect(extension.workerURL).toBe(`chrome-extension://${extension.id}/background.js`);
  const page = await extension.newExtensionPage('probe.html');
  const send = (type: 'read' | 'increment') =>
    page.evaluate(async type => chrome.runtime.sendMessage({ type }), type) as Promise<{ counter: number; bootId: string }>;
  const baseline = await send('increment');
  expect(baseline.counter).toBe(1);
  const observation = await forceWorkerRestart({
    page,
    workerURL: extension.workerURL,
    trigger: async () => { await send('read'); },
    getBootIdentity: async () => (await send('read')).bootId,
  });
  const final = await send('read');
  expect(lifecycleVerdict(observation, final.counter === baseline.counter)).toMatchObject({
    verdict: 'PASS', code: 'STATE_PRESERVED',
  });
  expect(observation.stopped).toBe(true);
  expect(observation.restarted).toBe(true);
  expect(observation.identityChanged).toBe(true);
});
