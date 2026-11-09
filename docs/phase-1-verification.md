# Phase 1 verification

9 November 2026. Extends existing draft [PR #2](https://github.com/hanifwidi/mv3-testkit/pull/2)
on `feat/phase-1-core-engine`; the earlier launcher/lifecycle implementation was
already present at `3080f69`. This follow-up adds JSON config, preflight for declared
pages and Chrome versions, runtime error diagnosis, a built local doctor CLI,
integration tests and CLI acceptance coverage. The Phase 0 validator correction
from PR #3 is included in this branch so it uses the strengthened evidence gate.
No `main` push, PR merge, npm publication or Phase 2 expansion is performed.

## Local execution

| Check | Actual result |
| --- | --- |
| `pnpm typecheck` | Exit 0 |
| `pnpm build` | Exit 0; JavaScript/declarations emitted to ignored `dist/` |
| `pnpm test:unit` | 95 passed in 8 files, 0 failed/skipped; includes integration tests with fake browser adapters |
| `node --test scripts/check-evidence.test.mjs` | 21 passed, 0 failed/skipped |
| `pnpm exec playwright test --project=core --grep 'missing browser'` | 1 passed; built CLI reports missing Chromium as INCONCLUSIVE/exit 2 |
| `node bin/mv3tk.mjs doctor --help` | Exit 0; command contract and exit codes printed |
| Doctor against healthy fixture on this cloud instance | INCONCLUSIVE/exit 2, `MV3_CHROMIUM_UNAVAILABLE`; valid manifest passed preflight |
| `git diff --check` | Exit 0 |

The unit/integration suites are not evidence of browser lifecycle behavior. The
targeted CLI check deliberately uses an empty browser cache; it verifies honest
failure reporting and does not exercise a running browser. The current cloud
instance still enforces the original restricted network policy and has no bundled
Chromium, so the full browser suite is delegated to the actual GitHub CI runner.

## CI acceptance

Results for this new implementation are pending its push at the time this section
was written. Earlier Phase 1 successes do not count as verification of the new CLI.
Required steps: frozen install, bundled Chromium installation, TypeScript/build,
unit/integration suites, and five core tests repeated three times without retries.
The existing Phase 0 workflow must also pass the healthy/broken fixture gate,
negative control and ordered CDP evidence validation.

Core acceptance checks cover healthy-state preservation, detection of volatile
state loss, a nested worker entry, doctor loading from file-relative JSON config,
and doctor refusing readiness when Chromium is missing. The CI artifact retains
the Playwright report and attached doctor JSON. Public job conclusions are
distinguished from raw artifacts if authentication prevents downloading them.

## Limits

Technical scope is the pinned Node/Chromium/Linux configuration. Natural idle,
browser updates/new worker versions, external projects, concurrent storage edits,
toolbar popup behavior and other platforms are unverified. The source API and
local doctor are experimental. General manifest validation, full CLI DX, package
publication and Phase 2 fixture expansion are not completion claims of this work.

Maintainer review is required before merging the draft. A successful doctor
verifies startup/discovery/cleanup, not worker restart or extension business logic.
