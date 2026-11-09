import { expect, it } from 'vitest';
import { childExitCode, parseTestOptions, testArguments } from '../../src/cli/test-runner.js';

it('passes flags and grep as individual arguments, never as shell code', () => {
  const grep = 'a; $(echo never) `literal`';
  const options = parseTestOptions(['--config', 'custom.mjs', '--grep', grep, '--headed', '--debug']);
  const args = testArguments(options, '/tmp/fresh-report');
  expect(args).toContain(grep);
  expect(args).toContain('--headed');
  expect(args).toContain('--debug');
  expect(args).toContain('/tmp/fresh-report/raw-results');
  expect(args[args.indexOf('--grep') + 1]).toBe(grep);
});
it.each([
  [0, null, 0], [1, null, 1], [null, 'SIGINT', 130], [null, 'SIGTERM', 143], [null, 'SIGKILL', 137], [null, 'SIGSEGV', 139],
] as const)('preserves the runner exit code or signal: code %j signal %j -> %j', (code, signal, expected) => {
  expect(childExitCode(code, signal)).toBe(expected);
});
it.each([['--unknown'], ['--config'], ['--grep', '--headed'], ['--config', 'a', '--config', 'b']])(
  'rejects invalid wrapper options %j', (...args: string[]) => {
    expect(() => parseTestOptions(args)).toThrow();
  },
);
