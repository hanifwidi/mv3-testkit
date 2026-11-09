import { test, expect } from '@playwright/test';
import { inspectExtension, diagnoseError } from '../../src/core/index.js';

test('the invalid manifest fixture produces a preflight diagnostic, not a browser timeout', async ({}, info) => {
  let failure: unknown;
  try { await inspectExtension('test-extensions/invalid-manifest'); }
  catch (error) { failure = error; }
  expect(failure).toMatchObject({ code: 'MANIFEST_VERSION' });
  const diagnostic = diagnoseError(failure);
  expect(diagnostic).toMatchObject({ verdict: 'FAIL', code: 'MV3_MANIFEST_INVALID' });
  await info.attach('phase2-invalid-manifest', { body: JSON.stringify(diagnostic, null, 2), contentType: 'application/json' });
});
