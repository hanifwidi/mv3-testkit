import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { createMV3Test, loadConfig, forceWorkerRestart, lifecycleVerdict } from 'mv3-testkit';

const test = createMV3Test(await loadConfig(fileURLToPath(new URL('../../mv3-testkit.config.json', import.meta.url))));
test('counter UI and storage survive an observed worker restart', async ({ extension }, info) => {
  const popup = await extension.openPopupDocument();
  const counter = popup.getByRole('status');
  await expect(counter).toHaveText('0');
  await popup.getByRole('button', { name: 'Increment', exact: true }).click();
  await expect(counter).toHaveText('1');
  const read = () => popup.evaluate(async () => chrome.runtime.sendMessage({ type: 'read' }));
  const evidence = await forceWorkerRestart({
    page: popup, workerURL: extension.workerURL, testId: info.testId,
    trigger: async () => { await read(); }, getBootIdentity: async () => (await read()).bootId,
  });
  const state = await extension.readStorage(popup, ['counter']);
  expect(lifecycleVerdict(evidence, state.counter === 1).verdict).toBe('PASS');
  await popup.reload();
  await expect(counter).toHaveText('1');
  await info.attach('example-lifecycle', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
});
