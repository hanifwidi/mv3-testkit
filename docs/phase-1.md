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
