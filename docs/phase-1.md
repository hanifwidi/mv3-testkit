# Phase 1 — Core Engine and doctor

This is an **unreleased experimental API**. See the [verification report](phase-1-verification.md)
for actual results and remaining limits; no release or merge is approved automatically.

## Modules
- `src/core/manifest.ts`: MV3 preflight with background worker location and symlink containment checks.
- `src/core/loader.ts`: isolated Chromium launcher, worker discovery and guaranteed close on launch failures.
- `src/core/lifecycle.ts`: experimental CDP forced-stop observation and boot identity comparison. Not a natural-idle simulator.
- `src/core/diagnostics.ts`: structured PASS / FAIL / INCONCLUSIVE and state-preservation codes.
- `src/core/fixtures.ts`: Playwright fixture factory with per-test temporary profile.
- `src/core/index.ts`: explicit developer-facing exports for evaluation.
- `src/core/config.ts`: strict JSON configuration and paths relative to the config file.
- `src/core/doctor.ts`, `src/cli/index.ts`: manifest, real browser launch/discovery and cleanup diagnosis.

## Build and doctor

Use the existing checkout; cloud tasks already have isolated workspaces. Do not
create another worktree unless explicitly requested. Node 24 and the pinned pnpm
are required. After `pnpm install --frozen-lockfile` and browser installation:

```sh
pnpm build
pnpm run doctor --extension test-extensions/healthy-counter
node bin/mv3tk.mjs doctor --extension test-extensions/nested-worker
pnpm test
```

`pnpm run doctor` builds first (plain `pnpm doctor` runs pnpm's own built-in
diagnostics instead of this script). For machine-readable JSON without package-manager
output, run `node bin/mv3tk.mjs doctor ...` after building. The command always
attempts real Chromium loading and discovery; it does not substitute mock success.
Exit codes are **0 PASS**, **1 FAIL** (invalid config/build), **2 INCONCLUSIVE**
(browser, discovery or cleanup failure). Doctor does not stop/restart the worker
or prove application behavior; use the real-browser regression tests for that.

Configuration is a JSON object, not executable TypeScript:

```json
{
  "extensionPath": "./dist",
  "headless": true,
  "discoveryTimeoutMs": 15000,
  "launchTimeoutMs": 30000
}
```

`launchTimeoutMs` bounds Chromium startup (default 30000) so a hung launch is
reported as `MV3_CHROMIUM_LAUNCH_FAILED` and its temporary profile is removed,
instead of surfacing only as the outer test timeout. A browser process that is
still starting when the timeout fires can recreate that directory before
Playwright terminates it. `discoveryTimeoutMs` bounds worker discovery and then
activation. Both timeouts are optional.

Save it as `mv3-testkit.config.json` in your extension project, then run
`node /path/to/mv3-testkit/bin/mv3tk.mjs doctor --config /path/to/project/mv3-testkit.config.json`.
`extensionPath` resolves relative to the JSON file, independently of the current
directory. Unknown fields, nonboolean headless settings, and invalid/overflowing
timeouts fail early. Only one of `--extension` and `--config` is accepted.

Preflight verifies Chrome numeric versions (1–4 parts, each 0–65535, no leading
zeros, not all zero), worker paths, and declared popup/options files. It follows
symlinks to reject entries escaping the extension root. Like Chromium, it accepts a
leading UTF-8 BOM and `//` or `/* */` comments in `manifest.json` (not trailing
commas). Extension paths containing a comma are rejected, because Chromium splits
`--load-extension` on commas. It does not validate every
Chrome manifest field or inspect every imported worker dependency.

## Diagnostic codes

| Code | Meaning |
| --- | --- |
| `MV3_CONFIG_INVALID` / `MV3_CONFIG_UNREADABLE` | Unsupported fields/values or unreadable JSON |
| `MV3_MANIFEST_INVALID` / `MV3_WORKER_MISSING` | Unusable build or no background worker for this workflow |
| `MV3_PAGE_ENTRY_NOT_FOUND` | Invalid, missing or escaping declared popup/options entry |
| `MV3_CHROMIUM_UNAVAILABLE` | Pinned Playwright binary is missing; install Chromium |
| `MV3_CHROMIUM_LAUNCH_FAILED` | Launch failed; original error is retained |
| `MV3_EXTENSION_LOAD_TIMEOUT` / `MV3_EXTENSION_LOAD_FAILED` | Matching worker was not discovered or did not activate; distinguishes timeout from other failures |
| `MV3_WORKER_REGISTRATION_FAILED` | FAIL: Chromium discarded the worker, e.g. a script error at startup; the message carries Chrome's error |
| `MV3_CLEANUP_FAILED` / `MV3_OPERATION_AND_CLEANUP_FAILED` | Resource cleanup failed; no readiness PASS |
| `MV3_READY` | Manifest checked, real browser launched, worker discovered and activated, owned resources closed |

The preflight API retains field-level `MV3PreflightError.code` values. `diagnoseError`
maps them to the doctor codes above. Lifecycle diagnostics retain `STATE_PRESERVED`,
`STATE_LOST` and `LIFECYCLE_UNVERIFIED` from the existing experimental adapter.

## Example (trusted local extension builds only)

```ts
import { createMV3Test } from './src/core/index.js';
const test = createMV3Test({ extensionPath: './dist' });
test('opens extension', async ({ extension }) => {
  const page = await extension.newExtensionPage('options.html');
  // Use regular Playwright assertions.
});
```

Do not run unpacked untrusted extension code; this executes code in a real Chromium process. Lifecycle tests require the extension to supply an explicit boot identity. The toolkit never silently injects an identity.

## Scope and limits

- Chromium only, single loaded extension per isolated profile, test fixtures run serially.
- Forced-stop CDP is experimental. It does not verify natural idle, alarms or update lifecycle.
- No released npm package, CLI `init`/`test`, multi-browser matrix or stable SemVer API yet.
- Tests cover preflight, data classification, isolated browser loading, worker stop and restart.
- Version/registration replacement, unavailable restart, CDP detachment and cleanup
  failures have focused tests. Independent user projects remain future validation;
  worker updates are unsupported, not a verified restart.

Run `pnpm typecheck`, `pnpm test:unit`, `pnpm test:core` with Playwright Chromium installed, and existing Phase 0 gates.

## Phase 1 hardening follow-up

The draft PR now includes negative-control coverage for the reusable driver, a real
nested-worker fixture and explicit worker lifecycle error tests. These are meant to
catch stale event reuse, worker version replacement, CDP stop failures, unresponsive
restart triggers, unchanged boot identities and registration changes.

- Lifecycle events are matched by worker script URL and exact worker version;
  another version's start must not produce a false PASS.
- Operations and consumer callbacks have bounded deadlines. Promise deadlines do
  not cancel already-running consumer operations; do not use callbacks with
  irreversible side effects or allow them to retain browser references.
- Cleanup is shared between concurrent close calls and attempts to remove both
  browser context and owned temporary profile even if one fails.
- Extension page URLs are intentionally restricted to normalized ASCII-local paths.
- Manifest preflight intentionally accepts normalized ASCII script paths only;
  more complex manifest paths require explicitly tested support.
- Diagnostics require matching observed stopped/running events, not just boolean
  flags. Neither this nor the forced-stop driver proves natural idle.
- Testing is performed in isolated browser profiles with **trusted extension code
  only**; never load a random third-party extension in an unrestricted CI runner.

### Required QA
The branch must pass Phase 0 and Phase 1 Actions, including three repetitions of
each of the five Phase 1 tests (four browser workflows and the missing-browser
negative control). CI success is not sufficient for release or merge approval
without code review. See the [recorded results](phase-1-verification.md).
