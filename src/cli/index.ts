import { loadConfig, resolveConfig, MV3ConfigError } from '../core/config.js';
import { doctor } from '../core/doctor.js';
import { diagnoseError } from '../core/errors.js';

const help = 'Usage: mv3tk doctor (--extension <unpacked-directory> | --config <config.json>)\nReports JSON. Exit codes: 0 PASS, 1 FAIL, 2 INCONCLUSIVE. No idle/restart guarantee.';

export async function main(args: string[], write: (text: string) => void = text => { process.stdout.write(text + '\n'); }): Promise<number> {
  if ((args.length === 1 && ['--help', '-h'].includes(args[0])) ||
    (args.length === 2 && args[0] === 'doctor' && ['--help', '-h'].includes(args[1]))) {
    write(help); return 0;
  }
  let output;
  try {
    if (args.length !== 3 || args[0] !== 'doctor' || !['--extension', '--config'].includes(args[1]) || !args[2])
      throw new MV3ConfigError('CONFIG_INVALID', help);
    const options = args[1] === '--config' ? await loadConfig(args[2]) : resolveConfig({ extensionPath: args[2] });
    output = await doctor(options);
  } catch (error) {
    output = { schemaVersion: 1, checkedAt: new Date().toISOString(), ...diagnoseError(error) };
  }
  write(JSON.stringify(output, null, 2));
  return output.verdict === 'PASS' ? 0 : output.verdict === 'FAIL' ? 1 : 2;
}
