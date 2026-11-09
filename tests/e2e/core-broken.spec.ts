import { expect } from '@playwright/test';
import { createMV3Test, forceWorkerRestart, lifecycleVerdict } from '../../src/core/index.js';

const test = createMV3Test({ extensionPath: 'test-extensions/volatile-state-bug' });

test('reusable core detects state loss in a real MV3 worker', async ({ extension }) => {
  const page = await extension.newExtensionPage('probe.html');
  const send = (type: 'read' | 'increment') =>
    page.evaluate(async type => chrome.runtime.sendMessage({ type }), type) as Promise<{ counter: number; bootId: string }>;
  const before = await send('increment');
  expect(before.counter).toBe(1);
  const proof = await forceWorkerRestart({
    page, workerURL: extension.workerURL,
    getBootIdentity: async () => (await send('read')).bootId,
    trigger: async () => { await send('read'); },
  });
  const after = await send('read');
  expect(after.counter).toBe(0);
  expect(lifecycleVerdict(proof, before.counter === after.counter)).toMatchObject({
    verdict: 'FAIL', code: 'STATE_LOST',
  });
});
