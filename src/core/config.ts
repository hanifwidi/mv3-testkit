import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { LaunchOptions } from './loader.js';

export class MV3ConfigError extends Error {
  constructor(readonly code: 'CONFIG_INVALID' | 'CONFIG_UNREADABLE', message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MV3ConfigError';
  }
}

/** JSON configuration only: loading configuration never executes project code. */
export function resolveConfig(value: unknown, baseDirectory = process.cwd()): LaunchOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MV3ConfigError('CONFIG_INVALID', 'Configuration must be an object');
  const config = value as Record<string, unknown>;
  const allowed = new Set(['extensionPath', 'headless', 'discoveryTimeoutMs', 'launchTimeoutMs']);
  const unknown = Object.keys(config).filter(key => !allowed.has(key));
  if (unknown.length) throw new MV3ConfigError('CONFIG_INVALID', `Unknown configuration fields: ${unknown.join(', ')}`);
  if (typeof config.extensionPath !== 'string' || !config.extensionPath.trim())
    throw new MV3ConfigError('CONFIG_INVALID', 'extensionPath must be a nonempty string');
  if (config.headless !== undefined && typeof config.headless !== 'boolean')
    throw new MV3ConfigError('CONFIG_INVALID', 'headless must be a boolean');
  const timeoutMs = (field: 'discoveryTimeoutMs' | 'launchTimeoutMs', fallback: number) => {
    const value = config[field] ?? fallback;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647)
      throw new MV3ConfigError('CONFIG_INVALID', `${field} must be an integer from 1 to 2147483647`);
    return value;
  };
  return {
    extensionPath: resolve(baseDirectory, config.extensionPath),
    headless: config.headless ?? true,
    discoveryTimeoutMs: timeoutMs('discoveryTimeoutMs', 15_000),
    launchTimeoutMs: timeoutMs('launchTimeoutMs', 30_000),
  };
}

export async function loadConfig(file: string): Promise<LaunchOptions> {
  const path = resolve(file);
  let value: unknown;
  try { value = JSON.parse(await readFile(path, 'utf8')); }
  catch (cause) {
    throw new MV3ConfigError('CONFIG_UNREADABLE', `Cannot read JSON configuration at ${path}`, { cause });
  }
  return resolveConfig(value, dirname(path));
}
