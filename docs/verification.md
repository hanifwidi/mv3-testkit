# Phase 0 verification report

**Technical outcome: PASS on Ubuntu 24.04 CI. Recommendation: GO for the next
technical phase on the pinned configuration, subject to maintainer review.**
Local cloud browser checks remain **INCONCLUSIVE**. This is a technical feasibility
proof, not a general reliability guarantee or release approval.

Recorded 9 November 2026, approximately 13:49 WIB (UTC+7). Raw evidence uses UTC
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
  boot-identity check, and cleanup. These browser capabilities passed the strict CI gates described below.
- A separate content-script isolated-world DOM test and a deliberately failing
  persistence assertion with an evidence checker that rejects setup errors.

No production toolkit API, CLI, npm publication, release/license decision, browser
policy change, merge, or subsequent-phase work was performed.

## CI verification

[Run 42575203864](https://github.com/hanifwidi/mv3-testkit/actions/runs/42575203864),
[job 129021250716](https://github.com/hanifwidi/mv3-testkit/actions/runs/42575203864/job/129021250716)
succeeded on implementation commit `db15bb3988ab5fa28212b14449de3fa68e3bda05`.
Public job metadata shows all steps succeeded, including:

| Step | Observed conclusion | What the committed command requires |
| --- | --- | --- |
| Frozen dependency install | success | Lockfile installation completes |
| Playwright Chromium install with OS dependencies | success | Bundled Chromium available |
| Typecheck and Vitest | success | TypeScript and all 8 evidence-classifier tests pass |
| Repeat all three real-browser checks five times (no retries) | success | Healthy fixture PASS (`1 → 1`), volatile fixture FAIL (`1 → 0`), isolated-world DOM test; each repeated five times |
| Verify negative control actually fails for state loss | success | Runner exits 1; checker exits 0 requiring no setup error, bundled browser, observed stop/restart, changed boot ID, counter `1 → 0` |
| Upload evidence artifact | success | `phase-0-evidence` artifact uploaded |

The repeated suite ran from 06:47:47 to 06:47:59 UTC; the negative-control gate
from 06:47:59 to 06:48:01 UTC. These are observed step timestamps. The workflow has
no retries, skipped tests, expected-failure annotations, or `continue-on-error`.
Three tests × five repetitions configure fifteen browser checks; that command
completed successfully. Missing lifecycle evidence would fail the gate.

Individual console counts, actual browser-version strings, boot IDs, and CI JSON
payloads were **not downloaded** in this session. Public HTML exposes per-step
conclusions; raw logs and artifact download require GitHub sign-in. The API is
blocked from this cloud machine. Assertion outcomes are inferred from the strict
successful commands, not presented as locally retrieved raw JSON.

[Captured public step metadata](evidence/ci-job-42575203864.json) records the source
URL, exact commit, retrieval time, and all 13 successful step attributes. Signed-in
reviewers can inspect/download `phase-0-evidence` from the linked run. Playwright
1.65.0 configures Chromium 158.0.8127.18, revision 1254; this is the pinned dependency
revision, not a browser-version value independently read from the CI artifact.

## Local cloud checks

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
| GitHub API repository probe and `gh pr create --draft` | CONNECT 403 / POST GraphQL Forbidden | API blocked; PR was **not created** |
| Feature-branch push | Success | Implementation branch exists on GitHub; no direct main push |

There are no expected-failure annotations, disabled assertions, skipped tests, or
automatic retries. Failed acceptance tests are retained as failures. The fivefold
browser repeat gate was **not run locally** because the prerequisite binary is
unavailable. It subsequently succeeded on GitHub CI as documented above.

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

## Local reproduction and delivery prerequisites

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

Those technical gates subsequently succeeded on CI; local reproduction remains
blocked. No numerical reliability claim or full product-validation completion is
made. Broader blueprint competitor/user research remains outstanding. Technical
GO applies to the pinned forced-stop CI experiment only, not natural idle or other
platforms. See [limitations](lifecycle.md). This task does not proceed to Phase 1.

## Pull request delivery

The implementation branch was pushed, but draft PR creation was denied by the API
network policy. No PR number or URL is claimed. [Prepared PR text](pr-body.md) is
saved for reuse. After allowing `api.github.com`, retry:

```sh
gh pr create --repo hanifwidi/mv3-testkit --base main \
  --head feat/phase-0-lifecycle-poc --draft \
  --title "Phase 0: MV3 worker lifecycle proof and verification report" \
  --body-file docs/pr-body.md
```

Existing Git authentication does not itself prove API authorization. Verify the
existing binding after enabling the destination before requesting any additional
credential. Never supply token values in chat.

## Review follow-up (9 November 2026)

The original delivery note above records the restricted Codex Cloud environment at the time of the Phase 0 experiment. Subsequently, PR [#1](https://github.com/hanifwidi/mv3-testkit/pull/1) was created through the connected GitHub integration. The pull request CI for pre-remediation head `f350116e95a2f4917ddc4834feed8eacfcae2039` passed in [run 42575802913](https://github.com/hanifwidi/mv3-testkit/actions/runs/42575802913). Its raw artifact was obtained independently and reviewed: five healthy lifecycle reports showed counter 1 -> 1; five volatile reports showed 1 -> 0; and the negative-control evidence demonstrated observed worker stop, restart, changed boot identity and state loss.

In response to maintainer review, this branch also includes additional protections:
- Resource cleanup in the content-script E2E test now attempts browser, temporary-profile and HTTP-server disposal independently, with unit tests for cleanup failures.
- The CI workflow pins GitHub Actions to verified commits, does not retain checkout credentials, and retains read-only job permissions.
- A new evidence validator rejects missing, duplicate, inconsistent or out-of-sequence lifecycle reports, requires 5 reports for each of the two lifecycle fixtures and one independent negative control, and has tampering-focused tests. CI checks this before uploading artifacts and errors if no artifact files exist.

**Review status:** These remediations still require a successful CI run on their updated commit and maintainer review. Nothing in this addendum is a claim that the new changes already passed GitHub Actions. The existing experimental CDP constraints and natural-idle limitations remain unchanged. The PR stays draft and is not approved for merge or npm publication.
