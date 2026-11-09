import { expect, it } from 'vitest';
import { parseTestOptions, testArguments } from '../../src/cli/test-runner.js';

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
it.each([['--unknown'], ['--config'], ['--grep', '--headed'], ['--config', 'a', '--config', 'b']])(
  'rejects invalid wrapper options %j', (...args: string[]) => {
    expect(() => parseTestOptions(args)).toThrow();
  },
);
