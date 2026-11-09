import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export type MV3Manifest = {
  manifest_version: 3;
  name: string;
  version: string;
  background: { service_worker: string; type?: 'module' };
  permissions?: string[];
  action?: { default_popup?: string };
  options_page?: string;
  options_ui?: { page: string };
};

export class MV3PreflightError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'MV3PreflightError';
  }
}

/**
 * Chromium's manifest dialect: a leading UTF-8 BOM and // or block comments are
 * accepted (trailing commas are not). Strings are copied verbatim, so "//" in a
 * URL value is never treated as a comment.
 */
export function parseManifestJSON(text: string): unknown {
  let json = '';
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < text.length) {
    const char = text[i];
    if (char === '"') {
      let end = i + 1;
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
      json += text.slice(i, end + 1);
      i = end + 1;
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) throw new SyntaxError('Unterminated comment in manifest.json');
      json += ' ';
      i = end + 2;
    } else {
      json += char;
      i++;
    }
  }
  return JSON.parse(json);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validVersion(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(value)) return false;
  const parts = value.split('.').map(Number);
  return parts.every(n => n <= 65535) && parts.some(n => n > 0);
}

async function checkPage(root: string, entry: unknown, field: string): Promise<void> {
  if (typeof entry !== 'string' || !entry || !/^[A-Za-z0-9_./-]+$/.test(entry) ||
    isAbsolute(entry) || entry.split('/').some(part => !part || part === '.' || part === '..'))
    throw new MV3PreflightError('PAGE_ENTRY_INVALID', `${field} must be a normalized extension-local file path`);
  try {
    const actualRoot = await realpath(root);
    const file = await realpath(resolve(root, entry));
    const rel = relative(actualRoot, file);
    if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel) || !(await stat(file)).isFile())
      throw new Error('Entry is not a file within the extension');
  } catch (cause) {
    throw new MV3PreflightError('PAGE_ENTRY_UNREADABLE', `${field} (${entry}) is not accessible: ${String(cause)}`);
  }
}

/** Validate a trusted, unpacked MV3 build without running its code. */
export async function inspectExtension(inputPath: string): Promise<{
  path: string; manifest: MV3Manifest; workerPath: string;
}> {
  const path = resolve(inputPath);
  // Chromium reads --load-extension and --disable-extensions-except as
  // comma-separated lists, so it would load a different directory than this one.
  if (path.includes(','))
    throw new MV3PreflightError('EXTENSION_PATH', `The extension path must not contain a comma: ${path}`);
  let value: unknown;
  try {
    value = parseManifestJSON(await readFile(resolve(path, 'manifest.json'), 'utf8'));
  } catch (cause) {
    throw new MV3PreflightError('MANIFEST_UNREADABLE', `Could not read manifest.json: ${String(cause)}`);
  }
  if (!record(value) || value.manifest_version !== 3)
    throw new MV3PreflightError('MANIFEST_VERSION', 'Expected manifest_version: 3');
  if (typeof value.name !== 'string' || !value.name.trim() ||
      !validVersion(value.version))
    throw new MV3PreflightError('MANIFEST_IDENTITY', 'Manifest name and a numeric Chrome extension version are required');
  if (!record(value.background) || typeof value.background.service_worker !== 'string' ||
      !value.background.service_worker.trim()) {
    throw new MV3PreflightError('WORKER_MISSING', 'An MV3 background.service_worker is required for lifecycle testing');
  }
  if (value.background.type !== undefined && value.background.type !== 'module')
    throw new MV3PreflightError('WORKER_TYPE', 'Only absent or module worker type is valid for MV3');
  if (value.permissions !== undefined &&
      (!Array.isArray(value.permissions) || !value.permissions.every(p => typeof p === 'string'))) {
    throw new MV3PreflightError('MANIFEST_PERMISSIONS', 'Permissions must be an array of strings');
  }
  const worker = value.background.service_worker;
  if (!/^[A-Za-z0-9_./-]+$/.test(worker) || isAbsolute(worker) ||
      worker.startsWith('/') || worker.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw new MV3PreflightError('WORKER_PATH', 'Worker must be an extension-local normalized relative file path');
  }
  const workerPath = resolve(path, worker);
  const outside = relative(path, workerPath);
  if (outside === '..' || outside.startsWith('..' + sep) || isAbsolute(outside))
    throw new MV3PreflightError('WORKER_PATH', 'Worker escapes the extension directory');

  let actualRoot: string;
  let actualFile: string;
  try {
    actualRoot = await realpath(path);
    actualFile = await realpath(workerPath);
    if (!(await stat(actualFile)).isFile()) throw new Error('Not a file');
  } catch (cause) {
    throw new MV3PreflightError('WORKER_UNREADABLE', `Worker file not accessible: ${String(cause)}`);
  }
  const rel = relative(actualRoot, actualFile);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))
    throw new MV3PreflightError('WORKER_PATH', 'Worker symlink escapes the extension directory');
  if (value.action !== undefined) {
    if (!record(value.action)) throw new MV3PreflightError('PAGE_ENTRY_INVALID', 'action must be an object');
    // An empty default_popup explicitly disables the popup and is valid Chrome behavior.
    if (value.action.default_popup !== undefined && value.action.default_popup !== '')
      await checkPage(path, value.action.default_popup, 'action.default_popup');
  }
  if (value.options_page !== undefined) await checkPage(path, value.options_page, 'options_page');
  if (value.options_ui !== undefined) {
    if (!record(value.options_ui)) throw new MV3PreflightError('PAGE_ENTRY_INVALID', 'options_ui must be an object');
    await checkPage(path, value.options_ui.page, 'options_ui.page');
  }
  return { path, manifest: value as MV3Manifest, workerPath: worker };
}
