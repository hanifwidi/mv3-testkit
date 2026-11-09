import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export type MV3Manifest = {
  manifest_version: 3;
  name: string;
  version: string;
  background: { service_worker: string; type?: 'module' };
  permissions?: string[];
};

export class MV3PreflightError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'MV3PreflightError';
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate an unpacked MV3 extension without executing any of its code. */
export async function inspectExtension(inputPath: string): Promise<{ path: string; manifest: MV3Manifest; workerPath: string }> {
  const path = resolve(inputPath);
  let value: unknown;
  try {
    value = JSON.parse(await readFile(resolve(path, 'manifest.json'), 'utf8'));
  } catch (cause) {
    throw new MV3PreflightError('MANIFEST_UNREADABLE', `Could not read manifest.json: ${String(cause)}`);
  }
  if (!record(value) || value.manifest_version !== 3) {
    throw new MV3PreflightError('MANIFEST_VERSION', 'Expected manifest_version: 3');
  }
  if (typeof value.name !== 'string' || !value.name.trim() || typeof value.version !== 'string' || !value.version.trim()) {
    throw new MV3PreflightError('MANIFEST_IDENTITY', 'Manifest name and version are required');
  }
  if (!record(value.background) || typeof value.background.service_worker !== 'string' ||
      !value.background.service_worker.trim()) {
    throw new MV3PreflightError('WORKER_MISSING', 'An MV3 background.service_worker is required for lifecycle testing');
  }
  const worker = value.background.service_worker;
  if (isAbsolute(worker) || worker.includes('\\') || worker.split('/').includes('..') ||
      worker.split('/').includes('.') || worker.includes('?') || worker.includes('#') || worker.startsWith('/')) {
    throw new MV3PreflightError('WORKER_PATH', 'Worker must be a relative extension-local path');
  }
  const workerPath = resolve(path, worker);
  const outside = relative(path, workerPath);
  if (!outside || outside.startsWith('..' + sep) || outside === '..' || isAbsolute(outside)) {
    throw new MV3PreflightError('WORKER_PATH', 'Worker must resolve to a file inside the extension directory');
  }
  // Avoid following symlinks out of the supplied build directory.
  const { realpath } = await import('node:fs/promises');
  const actualRoot = await realpath(path);
  let actualFile: string;
  try {
    actualFile = await realpath(workerPath);
    if (!(await stat(actualFile)).isFile()) throw new Error('Not a file');
  } catch (cause) {
    throw new MV3PreflightError('WORKER_UNREADABLE', `Worker file not accessible: ${String(cause)}`);
  }
  const rel = relative(actualRoot, actualFile);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
    throw new MV3PreflightError('WORKER_PATH', 'Worker symlink escapes the extension directory');
  }
  return { path, manifest: value as MV3Manifest, workerPath: worker };
}
