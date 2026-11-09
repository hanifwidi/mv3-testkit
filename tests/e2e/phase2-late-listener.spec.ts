import { expect } from '@playwright/test';
import { createMV3Test, messageRecoveryVerdict, RESTART_STATES } from '../../src/core/index.js';
import { recordedRestart } from './phase2-evidence.js';

const test = createMV3Test({ extensionPath: 'test-extensions/late-listener-bug' });

test('a controlled late listener fails cold-start messaging after a proven restart, then recovers when registered', async ({ extension }, info) => {
  const page = await extension.newExtensionPage('probe.html');
  const gate = (value: 'open' | 'closed') => page.evaluate(async value => {
    await chrome.storage.local.set({ listenerGate: value });
  }, value);
  const stored = () => extension.readStorage(page, ['bootId', 'listenerBootId']);
  await expect.poll(async () => typeof (await stored()).bootId).toBe('string');
  const initialBoot = (await stored()).bootId as string;
  await gate('open');
  await expect.poll(async () => (await stored()).listenerBootId).toBe(initialBoot);
  const ping = () => page.evaluate(async () => chrome.runtime.sendMessage({ type: 'ping' })) as Promise<{ ok: boolean; bootId: string }>;
  expect(await ping()).toMatchObject({ ok: true, bootId: initialBoot });
  await gate('closed');
  // Closing the gate does not unregister the currently installed listener.
  expect(await ping()).toMatchObject({ ok: true, bootId: initialBoot });

  let previousBoot: string | undefined;
  const evidence = await recordedRestart({
    page, workerURL: extension.workerURL, testId: info.testId,
    // Wake using the synchronously registered storage listener. This proves boot
    // independently of the runtime listener deliberately broken by the gate.
    trigger: async () => { await page.evaluate(async () => {
      await chrome.storage.local.set({ wakeNonce: crypto.randomUUID() });
    }); },
    getBootIdentity: async () => {
      await expect.poll(async () => {
        const boot = (await stored()).bootId;
        return typeof boot === 'string' && boot !== previousBoot;
      }).toBe(true);
      previousBoot = (await stored()).bootId as string;
      return previousBoot;
    },
  }, info);
  expect(evidence.phases.map(p => p.state)).toEqual([...RESTART_STATES]);
  expect(evidence.browserVersion).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  expect(previousBoot).not.toBe(initialBoot);
  const coldMessage = await page.evaluate(async () => {
    try {
      const reply = await chrome.runtime.sendMessage({ type: 'ping' });
      return { recovered: reply?.ok === true, error: null };
    } catch (error) {
      return { recovered: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  const diagnostic = messageRecoveryVerdict(evidence, coldMessage.recovered);
  expect(diagnostic).toMatchObject({ verdict: 'FAIL', code: 'MESSAGE_NOT_RECOVERED' });
  // Positive control: browser and messaging still work after explicit registration.
  await gate('open');
  await expect.poll(async () => (await stored()).listenerBootId).toBe(previousBoot);
  const recovered = await ping();
  expect(recovered).toMatchObject({ ok: true, bootId: previousBoot });
  await info.attach('phase2-controlled-late-listener', {
    body: JSON.stringify({ diagnostic, initialBoot, restartedBoot: previousBoot, coldMessage, recovered }, null, 2),
    contentType: 'application/json',
  });
});
