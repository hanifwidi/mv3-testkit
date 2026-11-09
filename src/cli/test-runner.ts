import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:os';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MV3ConfigError } from '../core/config.js';
import type { Summary } from '../reporter/index.js';

export function parseTestOptions(args: string[]) {
  let config = 'playwright.mv3.config.mjs', reportDir = 'mv3-reports';
  let grep: string | undefined;
  let headed = false, debug = false;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new MV3ConfigError('CONFIG_INVALID', `Duplicate option ${flag}`);
    seen.add(flag);
    if (flag === '--headed') { headed = true; continue; }
    if (flag === '--debug') { debug = true; continue; }
    if (!['--config', '--report-dir', '--grep'].includes(flag))
      throw new MV3ConfigError('CONFIG_INVALID', `Unsupported test option ${flag}`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new MV3ConfigError('CONFIG_INVALID', `Missing value for ${flag}`);
    if (flag === '--config') config = value;
    if (flag === '--report-dir') reportDir = value;
    if (flag === '--grep') grep = value;
  }
  return { config: resolve(config), reportDir: resolve(reportDir), grep, headed, debug };
}

export function testArguments(options: ReturnType<typeof parseTestOptions>, directory: string): string[] {
  const reporter = fileURLToPath(new URL('../reporter/index.js', import.meta.url));
  if (reporter.includes(',')) throw new MV3ConfigError('CONFIG_INVALID', 'Reporter installation path cannot contain commas');
  const args = ['test', '--config', options.config, '--output', join(directory, 'raw-results'), '--reporter', `list,${reporter}`];
  if (options.grep !== undefined) args.push('--grep', options.grep);
  if (options.headed) args.push('--headed');
  if (options.debug) args.push('--debug');
  return args;
}

/** Shell convention 128 + signal number, so SIGKILL (e.g. OOM) is not reported as SIGTERM. */
export function childExitCode(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) return code;
  return 128 + ((signal && constants.signals[signal]) || constants.signals.SIGTERM);
}

async function runNode(cli: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: 'inherit', shell: false, env });
    const interrupt = () => { child.kill('SIGINT'); };
    const terminate = () => { child.kill('SIGTERM'); };
    const cleanup = () => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); };
    process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', (code, signal) => { cleanup(); accept(childExitCode(code, signal)); });
  });
}

export async function runTests(args: string[], write: (text: string) => void): Promise<number> {
  const options = parseTestOptions(args);
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  await mkdir(options.reportDir, { recursive: true });
  const directory = await mkdtemp(join(options.reportDir, 'run-'));
  const runId = randomUUID();
  const code = await runNode(cli, testArguments(options, directory), {
    ...process.env, MV3TK_REPORT_DIR: directory, MV3TK_RUN_ID: runId,
    MV3TK_HEADED: options.headed || options.debug ? '1' : '0',
  });
  write(`Reports: ${directory}`);
  if (code !== 0) return code; // Preserve the underlying runner's failure/signal.
  let summary: Summary;
  try {
    summary = JSON.parse(await readFile(join(directory, 'summary.json'), 'utf8'));
    const html = await readFile(join(directory, 'index.html'), 'utf8');
    if (summary.schemaVersion !== 1 || summary.runId !== runId || !html.startsWith('<!doctype html>'))
      throw new Error('Incomplete or stale report');
  }
  catch { write('INCONCLUSIVE: Playwright did not produce a readable summary'); return 2; }
  return summary.verdict === 'PASS' ? 0 : summary.verdict === 'FAIL' ? 1 : 2;
}
