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

**PASS on the pinned Ubuntu 24.04 CI configuration.** Source branch implementation
commit `8b4e93d` passed both pull-request workflows:

- [Phase 1 run 42600590753](https://github.com/hanifwidi/mv3-testkit/actions/runs/42600590753):
  frozen install, bundled Chromium install, TypeScript/build, unit/integration
  suites, and the five selected core tests repeated three times without retries
  all have successful job-step conclusions. This configures fifteen checks,
  including three intentional missing-browser controls.
- [Phase 0 run 42600590749](https://github.com/hanifwidi/mv3-testkit/actions/runs/42600590749):
  unit/integration and evidence-validator tests, three proof tests repeated five
  times, the expected negative-control failure and ordered CDP evidence validation
  all have successful job-step conclusions.
- Both evidence artifact upload steps succeeded.

[Captured public step metadata](evidence/ci-phase-1-8b4e93d.json) records the source
URLs, retrieval time and individual conclusions. Raw CI logs/JSON attachments were
not downloaded in this session; individual browser version strings and fixture
payloads are not invented here. Configured repetition counts and assertion
outcomes are inferred from the committed test selection and successful commands.

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

**Recommendation: technical GO for completion of the Phase 1 engine/skeleton on
the pinned configuration, subject to maintainer review.** This does not authorize
Phase 2, a release, or an automatic merge. The existing PR remains a draft.

Maintainer review is required before merging the draft. A successful doctor
verifies startup/discovery/cleanup, not worker restart or extension business logic.
