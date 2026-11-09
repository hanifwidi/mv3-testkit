import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const run = promisify(execFile);
const tarball = resolve(process.argv[2] ?? 'artifacts/mv3-testkit-0.1.0-alpha.0.tgz');
const { stdout } = await run('tar', ['-tzf', tarball]);
const files = stdout.trim().split('\n');
assert(files.length > 0);
for (const path of files) {
  assert(path.startsWith('package/') && !path.split('/').includes('..'), `Unsafe archive path ${path}`);
  assert(!/(^|\/)(node_modules|\.git|\.env(?:\.[^/]*)?)(\/|$)/.test(path), `Unexpected private entry ${path}`);
  assert(/^package\/(package\.json|README\.md|dist\/|bin\/|docs\/|examples\/)/.test(path), `Entry outside allowlist ${path}`);
}
const { stdout: json } = await run('tar', ['-xOf', tarball, 'package/package.json']);
const manifest = JSON.parse(json);
assert.equal(manifest.private, true, 'Package must stay private');
assert.equal(manifest.version, '0.1.0-alpha.0');
assert.equal(manifest.license, 'UNLICENSED', 'Public licensing remains a maintainer decision');
assert.equal(manifest.peerDependencies['@playwright/test'], '1.65.0');
assert.equal(manifest.bin.mv3tk, 'bin/mv3tk.mjs');
for (const required of ['dist/core/index.js', 'dist/core/index.d.ts', 'dist/cli/index.js', 'dist/reporter/index.js',
  'bin/mv3tk.mjs', 'examples/vanilla-mv3/manifest.json', 'examples/vanilla-mv3/tests/mv3/counter.spec.mjs'])
  assert(files.includes('package/' + required), `Missing package entry ${required}`);
const bytes = await readFile(tarball);
const report = { tarball, version: manifest.version, bytes: bytes.length, files: files.length,
  sha256: createHash('sha256').update(bytes).digest('hex'), private: true, published: false };
await mkdir(dirname(tarball), { recursive: true });
await writeFile(join(dirname(tarball), 'package-verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
