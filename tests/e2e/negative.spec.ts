import { test, expect } from '@playwright/test';
import { recordedProbe } from './helpers.js';

// This project MUST exit nonzero. No expected-failure annotation or hidden retry.
test('negative control: persistence assertion fails for the volatile-state bug', async ({}, info) => {
  const report = await recordedProbe('volatile-state-bug', info);
  expect(report.error).toBeUndefined();
  expect(report.evidence).toMatchObject({ stopped: true, runningAgain: true });
  expect(report.evidence.after?.bootId).not.toBe(report.evidence.before?.bootId);
  expect(report.verdict, 'State-loss regression must fail a normal persistence assertion').toBe('PASS');
});
