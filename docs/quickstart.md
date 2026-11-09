# Local alpha quickstart

Node 24 and the pinned Playwright 1.65.0 are required. This is an ESM-only,
private local alpha (`0.1.0-alpha.0`), not a package published to npm.
Only run trusted extension builds and test/config files.

## From the repository

Use the existing checkout; cloud tasks already have isolated workspaces. Do not
create a second worktree unless explicitly requested.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm exec playwright install --with-deps chromium
node bin/mv3tk.mjs test --config examples/vanilla-mv3/playwright.mv3.config.mjs
pnpm pack:local
node scripts/verify-package.mjs artifacts/mv3-testkit-0.1.0-alpha.0.tgz
```

This first-party example clicks a counter UI, verifies a worker stop/restart,
checks persistent storage and reloads the document. It is not evidence of
independent adoption or compatibility with a production extension.

## Install the local tarball in your project

```sh
pnpm add -D /absolute/path/mv3-testkit-0.1.0-alpha.0.tgz @playwright/test@1.65.0
pnpm exec playwright install --with-deps chromium
pnpm exec mv3tk doctor --extension ./dist
pnpm exec mv3tk init --extension ./dist
pnpm exec mv3tk test
```

`dist` must already contain your unpacked build and MV3 manifest. Init preflights
that build without executing it, then creates three files: JSON kit config,
`playwright.mv3.config.mjs`, and a starter spec under `tests/mv3/`. It refuses
existing targets rather than overwriting or merging them. Add `mv3-reports/` to
your ignore rules. Init does not edit your dependency declarations or source.

The starter verifies loading/discovery; add extension-specific assertions.
Lifecycle checks require an explicit boot identity supplied by your test build.
The kit never injects one or adds permissions silently. See the example test.

## CLI contract

```sh
mv3tk doctor --config mv3-testkit.config.json
mv3tk init --extension ./dist --directory ./test-project
mv3tk test --config playwright.mv3.config.mjs --grep lifecycle
mv3tk test --headed
mv3tk test --debug
mv3tk test --report-dir ./my-reports
```

Doctor's config is JSON; test's config is a trusted executable Playwright config.
Headed/debug flags are forwarded to Playwright and respected by the kit fixture.
They require a desktop; manual inspector behavior is not validated by headless CI.
No shell command is assembled from your arguments.

Each test command creates a new `run-*` directory under the report root and emits
`summary.json` and offline `index.html`. Existing reports are preserved. Read the
counts: PASSED, FAILED, EXPECTED_FAILURE, FLAKY, SKIPPED and UNRUN are distinct.
Zero passed tests, all-skipped cases or flaky recovery cannot produce a kit PASS.
Results cover selected tests; a filtered run is not proof of the entire project.

Playwright nonzero exits/signals are preserved. A runner exit 0 is promoted to 2
if the kit result is INCONCLUSIVE or its complete fresh reports are missing.
Doctor/init use 0 PASS, 1 FAIL, 2 INCONCLUSIVE. No tests are silently retried by the
starter configuration. Raw terminal errors remain visible for diagnosis.

Default reports omit stdout/stderr, error stacks/payloads, attachments, storage,
cookies and environment values. Common secret labels in names are redacted, also
as part of longer names such as `GITHUB_TOKEN` or `clientSecret`, as are URLs of
any scheme (for example `postgres://user:password@host`); HTML text is escaped. Test names and paths still must not contain secrets:
no automatic heuristic can guarantee universal redaction. Playwright raw files
under `raw-results/` are separate, user-controlled opt-in artifacts; review them
before sharing. There is no telemetry or report upload by the toolkit.

See [troubleshooting](troubleshooting.md), [support matrix](support-matrix.md),
and [security review](security-review.md) before using external extension code.


The export allowlist applies to test summary reports. Doctor/init JSON, native
terminal output and explicitly created raw Playwright artifacts are diagnostic
outputs; inspect and redact them before sharing.
