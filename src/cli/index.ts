import { loadConfig, resolveConfig, MV3ConfigError } from '../core/config.js';
import { doctor } from '../core/doctor.js';
import { diagnoseError } from '../core/errors.js';
import { initProject, MV3InitError } from './init.js';
import { runTests } from './test-runner.js';

const help = `Usage:
  mv3tk doctor (--extension <unpacked-directory> | --config <config.json>)
  mv3tk init --extension <unpacked-directory> [--directory <project-directory>]
  mv3tk test [--config <playwright.config.mjs>] [--grep <regex>] [--headed] [--debug] [--report-dir <directory>]
Exit codes: 0 PASS, 1 FAIL, 2 INCONCLUSIVE; test preserves other Playwright failure/signal codes.
Doctor and init emit JSON. Test writes safe HTML/JSON summaries and keeps raw runner output in the terminal.
No idle/restart guarantee. Init never overwrites existing files.`;

export async function main(args: string[], write: (text: string) => void = text => { process.stdout.write(text + '\n'); }): Promise<number> {
  if ((args.length === 1 && ['--help', '-h'].includes(args[0])) ||
    (args.length === 2 && ['doctor', 'init', 'test'].includes(args[0]) && ['--help', '-h'].includes(args[1]))) {
    write(help); return 0;
  }
  let output;
  try {
    if (args[0] === 'test') return await runTests(args.slice(1), write);
    if (args[0] === 'init') {
      const options: Record<string, string> = {};
      for (let i = 1; i < args.length; i += 2) {
        const flag = args[i], value = args[i + 1];
        if (!['--extension', '--directory'].includes(flag) || !value || value.startsWith('--') || options[flag])
          throw new MV3ConfigError('CONFIG_INVALID', help);
        options[flag] = value;
      }
      if (!options['--extension']) throw new MV3ConfigError('CONFIG_INVALID', help);
      output = await initProject(options['--extension'], options['--directory']);
    } else {
      if (args.length !== 3 || args[0] !== 'doctor' || !['--extension', '--config'].includes(args[1]) || !args[2])
        throw new MV3ConfigError('CONFIG_INVALID', help);
      const options = args[1] === '--config' ? await loadConfig(args[2]) : resolveConfig({ extensionPath: args[2] });
      output = await doctor(options);
    }
  } catch (error) {
    output = { schemaVersion: 1, checkedAt: new Date().toISOString(), ...(error instanceof MV3InitError
      ? { verdict: 'FAIL', code: error.code, message: error.message } : diagnoseError(error)) };
  }
  write(JSON.stringify(output, null, 2));
  return output.verdict === 'PASS' ? 0 : output.verdict === 'FAIL' ? 1 : 2;
}
