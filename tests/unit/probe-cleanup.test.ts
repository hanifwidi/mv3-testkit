import { access } from 'node:fs/promises';
import { beforeEach, expect, it, vi } from 'vitest';
import { chromium, type BrowserContext } from '@playwright/test';
import { probe } from '../../src/probe.js';

// Fake browser adapter: exercises the Phase 0 harness's failure bookkeeping only.
// These tests are not real-browser lifecycle evidence.
vi.mock('@playwright/test', () => ({ chromium: { launchPersistentContext: vi.fn() } }));
let profile = '';
beforeEach(() => {
  vi.resetAllMocks();
  profile = '';
});

function failingContext(): BrowserContext {
  return {
    setDefaultTimeout: () => {},
    browser: () => null,
    serviceWorkers: () => [],
    waitForEvent: async () => { throw new Error('worker discovery failed'); },
    close: async () => { throw new Error('browser close failed'); },
  } as unknown as BrowserContext;
}

it('keeps the root-cause error when browser cleanup also fails', async () => {
  vi.mocked(chromium.launchPersistentContext).mockImplementation(async path => {
    profile = path;
    return failingContext();
  });
  const report = await probe('test-extensions/healthy-counter');
  expect(report.verdict).toBe('INCONCLUSIVE');
  expect(report.error).toEqual({ phase: 'discovery', message: 'worker discovery failed' });
  const errors = report.timeline.filter(entry => entry.event === 'error').map(entry => entry.data);
  expect(errors).toEqual([
    { phase: 'discovery', message: 'worker discovery failed' },
    { phase: 'cleanup', message: 'browser close failed' },
  ]);
  // The temporary profile is still removed after the browser-close failure.
  expect(report.timeline.at(-1)?.event).toBe('profile.removed');
  await expect(access(profile)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('does not record a profile removal when no profile was created', async () => {
  const report = await probe('test-extensions/does-not-exist');
  expect(report).toMatchObject({ verdict: 'INCONCLUSIVE', error: { phase: 'manifest' } });
  expect(report.timeline.map(entry => entry.event)).toEqual(['error']);
  expect(chromium.launchPersistentContext).not.toHaveBeenCalled();
});
