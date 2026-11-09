# Phase 1 — Core Engine (initial implementation)

This is an **unreleased experimental API**, not the Phase 1 completion sign-off.

## Modules
- `src/core/manifest.ts`: MV3 preflight with background worker location and symlink containment checks.
- `src/core/loader.ts`: isolated Chromium launcher, worker discovery and guaranteed close on launch failures.
- `src/core/lifecycle.ts`: experimental CDP forced-stop observation and boot identity comparison. Not a natural-idle simulator.
- `src/core/diagnostics.ts`: structured PASS / FAIL / INCONCLUSIVE and state-preservation codes.
- `src/core/fixtures.ts`: Playwright fixture factory with per-test temporary profile.
- `src/core/index.ts`: explicit developer-facing exports for evaluation.

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
- No released npm package, CLI, multi-browser matrix or stable SemVer API yet.
- Tests cover preflight, data classification, isolated browser loading, worker stop and restart.
- Before declaring Phase 1 complete, extend coverage to worker updates, unavailable restart, CDP detachment, cleanup exceptions, and independent user projects.

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

### QA still required
The updated commit must pass Phase 0 and Phase 1 Actions, including three repetitions
of each Phase 1 browser test. CI success is not sufficient for release or merge
approval without code review. Track the branch commit and CI run in the PR description.
