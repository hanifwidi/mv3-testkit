# Phase 0 verification report

**Outcome: INCONCLUSIVE. Recommendation: NO-GO for Phase 1 until the real-browser
acceptance gates execute successfully.** This is an environmental blocker, not a
demonstrated failure of the lifecycle technique or proof that it works.

Recorded 9 November 2026, approximately 13:46 WIB (UTC+7). Raw evidence uses UTC
timestamps. Base: `hanifwidi/mv3-testkit`, `main` commit
`a58e103571b066742f6e681254d9851cbc0aac25`. Work is on
`feat/phase-0-lifecycle-poc`, never pushed directly to `main`.

## What exists

- A pinned, private pnpm/TypeScript project, Vitest unit suite, Playwright Test
  projects, lockfile, and Ubuntu 24.04 CI workflow.
- Two unpacked MV3 fixtures: acknowledged persistent storage and deliberately
  volatile worker-global storage. Both have a test-only extension message page.
- A real-browser launcher, dynamic ID/worker discovery, experimental CDP
  stop/observe/message-reactivate harness, bounded readiness checks, JSON timeline,
  boot-identity check, and cleanup. These browser capabilities remain **unverified**.
- A separate content-script isolated-world DOM test and a deliberately failing
  persistence assertion with an evidence checker that rejects setup errors.

No production toolkit API, CLI, npm publication, release/license decision, browser
policy change, merge, or subsequent-phase work was performed.

## Executed checks

The install used writable cache variables described in [reproduction.md](reproduction.md).
Browser runs set `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright`.

| Command/check | Actual result | Interpretation |
| --- | --- | --- |
| `pnpm install --frozen-lockfile --store-dir /workspace/.cache/pnpm/store` | Exit 0 | Dependency installation repeatable with committed lockfile |
| `pnpm typecheck` | Exit 0 | TypeScript checks pass |
| `pnpm test:unit` | Exit 0; 8 tests passed, 0 skipped | Evidence classifier rejects missing lifecycle proof and distinguishes preserved/lost counter |
| `pnpm browser:install` | Exit 1; HTTP 403 `Domain forbidden` for `cdn.playwright.dev` | Playwright Chromium 158.0.8127.18, revision 1254, could not be downloaded |
| `POC_OUTPUT_DIR=artifacts/bundled pnpm test:e2e` | Exit 1; 3 failed, 0 skipped | Browser executable unavailable. Both lifecycle reports are INCONCLUSIVE at launch; DOM check also fails to launch |
| `POC_OUTPUT_DIR=artifacts/negative pnpm test:negative` | Exit 1; 1 failed | Infrastructure failure, **not demonstrated detection** of the volatile-state bug |
| `node scripts/check-negative.mjs artifacts/negative` | Exit 1 | Correctly refuses the negative run's launch error as state-loss evidence |
| System Chromium exploratory suite | Exit 1; 3 failed | Chromium 156.0.8078.79 launched but fixtures were not loaded; discovery timed out and DOM marker absent |
| System Chromium direct-binary retry and targeted debug run | Exit 1 | Removing the default disable-extensions flag and bypassing the distro wrapper did not resolve the managed-policy block |
| `node --check` for all four fixture JS files | Exit 0 | Syntax only; not browser behavior verification |
| `git diff --check` | Exit 0 | No whitespace errors |
| Post-run `/tmp/mv3-testkit-*` directory check | No directories remained | Temporary profiles from executed runs removed |
| `git ls-remote origin refs/heads/main` | Remote SHA matches base | Existing HTTPS Git read access works |
| GitHub API repository probe | CONNECT 403 / Forbidden | API destination is blocked; PR creation cannot yet be verified |

There are no expected-failure annotations, disabled assertions, skipped tests, or
automatic retries. Failed acceptance tests are retained as failures. The fivefold
browser repeat gate was **not run** because the prerequisite binary is unavailable.
The CI configuration is committed but has **not** been executed on GitHub.

## Raw evidence

- [Frozen install log](evidence/install.log), [typecheck log](evidence/typecheck.log),
  [Vitest log](evidence/unit.log).
- [Bundled-browser runner log](evidence/bundled-e2e.log),
  [healthy JSON](evidence/bundled-healthy-counter.json),
  [volatile JSON](evidence/bundled-volatile-state-bug.json).
- [Negative runner log](evidence/negative-control.log),
  [negative JSON](evidence/negative-volatile-state-bug.json),
  [checker rejection](evidence/negative-checker.log).

These are actual command outputs and reports from this machine, including failures;
log trailing whitespace is normalized for Git, without changing the results.
Per-test JSON contains unique run/test IDs and timestamps. It intentionally omits
before/after counters and a browser version when browser launch never occurred.

Environment: Debian 13 x86_64; Node 24.22.1; pnpm 11.25.0; TypeScript 5.9.3;
Vitest 5.1.0; Playwright 1.65.0. The pnpm home-directory failure on the first install
was resolved with writable cache paths. The system browser's managed
`ExtensionInstallBlocklist: ["*"]` explains its inability to load these fixtures.
Platform browser policies and TLS verification were preserved.

## Gate and next verification

1. Enable `cdn.playwright.dev` in environment network settings and retry the pinned
   browser installer. Add further official redirect domains only if required by
   the observed download. Enable `api.github.com` for PR creation. The draft-read
   tool returned `INVALID_ARGUMENT`; no unknown existing allowlist was overwritten.
2. Run the documented full suite and fivefold repeat on bundled Chromium. Require
   a stopped status for the exact worker, then running status, changed boot ID,
   healthy counter `1 → 1`, and broken counter `1 → 0`.
3. Require the isolated-world DOM check to pass. Run the negative project and
   checker: the runner must exit 1 **for observed state loss**, and checker exit 0.
4. Save new raw evidence, update this report, and review the experimental CDP
   assumptions before changing the recommendation. Check CI independently.

Until those checks run, the POC's ability to load an extension, stop/reactivate its
worker, and detect the real bug is **not proven**. No numerical reliability claim
or full Phase 0 completion is made. Broader blueprint competitor/user research is
also outside this technical implementation and remains outstanding.
