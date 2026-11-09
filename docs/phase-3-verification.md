# Phase 3 local-alpha verification

9 November 2026. Branch `feat/phase-3-cli-prerelease`, based on Phase 2
`04f5d41`; review base is `feat/phase-2-lifecycle-fixtures` while its prerequisite
review is outstanding. This is a **private local alpha**, not an npm publication
or a public beta. No main push, PR merge or Phase 4 action is performed.

## Implementation

- Local `init`/`test` CLI over the pinned Playwright runner. Init refuses overwrite
  and internal directory symlinks; no package/source/dependency edits in consumer projects.
- Fresh offline HTML/JSON reports with distinct passed, failed, expected-failure,
  flaky, skipped and unrun counts. A zero runner exit is not enough for kit PASS.
- Default report field allowlist, name redaction, escaped HTML, no copied raw
  payloads. Raw terminal output and explicit Playwright artifacts are separate.
- ESM exports/declarations, installed executable, exact Playwright peer, packaging
  allowlist and `0.1.0-alpha.0` tarball. `private: true` and `UNLICENSED` remain.
- First-party vanilla counter extension and installed-consumer smoke workflow.
  This is self-dogfooding in this repo, not independent/production adoption.
- Lint, security review, quickstart, troubleshooting and support matrix.

## Executed local checks

| Check | Actual result |
| --- | --- |
| `pnpm lint` | Exit 0 |
| `pnpm typecheck` / `pnpm build` | Exit 0 |
| `pnpm test:unit` | 133 passed in 13 files; 0 failed/skipped |
| `node --test scripts/check-evidence.test.mjs` | 21 passed; 0 failed/skipped |
| `pnpm audit --json` before remediation | Exit 1; one moderate dev-tool advisory, GHSA-g3hv-75wg-m249 |
| Audit after patched minimatch 11.0.1 override | Exit 0; 0 advisory counts in the observed snapshot |
| `pnpm pack:local` | Private tarball created; no registry publication |
| Package verification script | 49 allowlisted entries, required executable/exports/build files present; checksum recorded in local artifact metadata |
| Clean consumer npm installation | Exit 0 with exact Playwright peer and install scripts disabled |
| Installed executable help | Exit 0 |
| Init then repeat init | Exit 0, then expected exit 1; original files preserved |
| Real runner positive control | Exit 0; one passed test recorded |
| Real runner assertion-failure control | Exit 1 preserved; marker and failed count verified |
| All-skipped runner control | Kit exit 2 / INCONCLUSIVE, not a pass |
| Retry control with one stable pass and one flaky case | Kit exit 2 / INCONCLUSIVE; flaky and passed counts distinct |
| Local browser consumer workflow | NOT RUN; the cloud instance has no bundled Chromium |

The deliberate failed/skipped/retried control cases are created only inside the
temporary consumer to verify CLI behavior. They are not disabled product tests,
not claimed as browser proof, and their actual exits are checked. The consumer
record explicitly says `browser: NOT_RUN` in local browser-free mode.

The workspace override intentionally replaces a transitive lint dependency across
a major version boundary; full lint/build/unit checks passed with it. It is not
shipped as a consumer override. See [security review](security-review.md) and the
[recorded audit snapshot](evidence/dependency-audit-phase3.json). Zero known audit
findings do not establish absence of unknown vulnerabilities.

## Required CI gate

**PASS for the private local alpha on source commit `76dedcd`.** All four push
workflows have successful conclusions for every step:

- [Phase 3 run 42618559124](https://github.com/hanifwidi/mv3-testkit/actions/runs/42618559124):
  frozen installation, lint/typecheck/build/unit tests, audit, real Chromium
  installation, tarball inspection, and fresh installed-consumer smoke all passed.
  The consumer script requires the installed executable, non-overwriting init,
  actual doctor readiness, both generated discovery and first-party UI/restart
  tests passing, and actual browser-version/extension annotations. Negative,
  skipped and flaky controls must retain their documented nonzero exits.
- [Phase 0 run 42618559102](https://github.com/hanifwidi/mv3-testkit/actions/runs/42618559102):
  repeated proof suite, negative control and ordered evidence gate passed.
- [Phase 1 run 42618559050](https://github.com/hanifwidi/mv3-testkit/actions/runs/42618559050):
  core tests repeated three times passed.
- [Phase 2 run 42618559171](https://github.com/hanifwidi/mv3-testkit/actions/runs/42618559171):
  three acceptance cases repeated five times passed.

All artifact uploads succeeded. [Captured public step metadata](evidence/ci-phase-3-76dedcd.json)
records source commit, retrieval time and individual conclusions. Raw CI
payloads, browser versions and tarball checksums were not downloaded in this
session; no values are invented here. The assertion outcomes above are inferred
from the committed scripts and successful command conclusions.

**Recommendation: technical GO for private/local alpha use on the pinned
configuration, subject to code review. NO-GO for automatic public publication.**

CI artifact `phase-3-local-alpha` includes the tarball, checksum metadata, audit
snapshot, consumer record and whitelisted HTML/JSON reports. It excludes npm
caches, installed dependencies and raw consumer logs/results. Tests may explicitly
create raw artifacts; review those separately before sharing.

## Release and review limits

Only Node 24, exact Playwright/bundled Chromium and Linux CI are intended here.
Headed/debug flags are forwarded and fixture precedence is implemented, but
interactive inspector, signal handling and other platforms are not integration
validated. Natural idle, worker updates and external production extensions remain
outside the evidence. Reports are consistency summaries, not authenticated attestations.

Public license selection, package-name/scope ownership, maintainer review,
independent adopter testing and the Phase 4 release gate remain outstanding.
This phase does not authorize publishing, merging, or changing access credentials.

The session's GitHub API denial remains a separate review-delivery blocker.
`gh pr create --draft` was attempted against base `feat/phase-2-lifecycle-fixtures`
and failed with POST `https://api.github.com/graphql`: Forbidden. The branch is
pushed, but a Phase 3 PR has **not** been created or assigned a number here.

[Create the stacked Phase 3 draft](https://github.com/hanifwidi/mv3-testkit/compare/feat/phase-2-lifecycle-fixtures...feat/phase-3-cli-prerelease?expand=1)
using the [prepared description](phase-3-pr-body.md), or retry after the running
instance permits API access:

```sh
gh pr create --repo hanifwidi/mv3-testkit --draft \
  --base feat/phase-2-lifecycle-fixtures --head feat/phase-3-cli-prerelease \
  --title "Phase 3: CLI workflows, safe reports and private local alpha" \
  --body-file docs/phase-3-pr-body.md
```

This does not require putting a token in chat. Git HTTPS push works independently
of the observed API domain denial. Review the prerequisite phases before merging
this stacked branch; no merge or public release was performed.

## Final redaction review

An additional synthetic metadata case reproduced a leak in the first redactor:
`Authorization: Bearer <credential>` removed the scheme but retained the credential.
The targeted suite reported 8 passed and 1 failed before correction. Redaction now
consumes the rest of a line after a sensitive assignment, also covering cookie
lists, quoted JSON keys, access tokens and multiword values. Raw payload fields
remain omitted. This intentionally may remove additional context from test names.
After correction, lint/typecheck/build and all 133 unit/integration tests passed
locally. Source `15e9ffb` then passed the full installed-consumer workflow in
[run 42619309906](https://github.com/hanifwidi/mv3-testkit/actions/runs/42619309906),
including audit, packaging, CLI controls and actual browser counter/restart tests.
Phase [0](https://github.com/hanifwidi/mv3-testkit/actions/runs/42619309959),
[1](https://github.com/hanifwidi/mv3-testkit/actions/runs/42619309939) and
[2](https://github.com/hanifwidi/mv3-testkit/actions/runs/42619309958) also passed
on that source. [Captured step conclusions](evidence/ci-phase-3-redaction-15e9ffb.json)
record this follow-up separately; raw payloads were not downloaded.
The local tarball is rebuilt with the corrected reporter and verified structurally.
The technical recommendation remains GO for local alpha use, with public release
and manual review prerequisites unchanged.

## Second review pass (9 November 2026)

A further review of the stacked Phase 0–3 code found the defects below. Each new
regression test was first run against the previous code, where it failed.

| Area | Defect | Change |
| --- | --- | --- |
| Report redaction | Labels matched only as whole words and only http(s) URLs were removed, so `GITHUB_TOKEN=…`, `DB_PASSWORD=…`, `clientSecret: …` and `postgres://user:password@host` passed through | Labels also match the end of a longer identifier; URLs of every scheme are removed. 13 leak cases failed before the fix |
| Report titles | Empty root-suite/project segments rendered as ` ›  › file › test` | Empty segments are dropped |
| `mv3tk test` exit code | Every signal except SIGINT was reported as 143, e.g. SIGKILL from an out-of-memory kill | 128 + signal number |
| Phase 0 probe cleanup | A cleanup failure replaced `report.error`, hiding the root cause; `profile.removed` was logged when no profile existed | The first error is kept; cleanup failures still force INCONCLUSIVE and stay in the timeline |
| Phase 0 CI artifact | The negative-control run replaced `playwright-report/`, so the uploaded artifact lost the proof suite's HTML; a bare `pnpm test:negative` cleared `test-results/` | The negative control defaults to `artifacts/negative`; with `POC_OUTPUT_DIR` set, HTML goes to `<dir>-html/` |
| Evidence gate | `playwright-bundled` plus any four-part version passed, so a `PLAYWRIGHT_BROWSERS_PATH` holding another Chromium build satisfied the bundled-browser gate | Both checkers require the version pinned by the installed Playwright (`158.0.8127.18` for 1.65.0) |
| Focused tests | Without `forbidOnly`, a committed `test.only` silently shrinks a CI run; core/phase2 have no report-count check | `forbidOnly: !!process.env.CI` in the repository config, the `init` starter and the example |

Executed local verification (Node 24.22.1, pnpm 11.25.0, Playwright 1.65.0):

- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `git diff --check` — exit 0.
- `pnpm test:unit` — 156 passed in 14 files; `node --test scripts/check-evidence.test.mjs` — 22 passed.
- Browser runs used the session's pre-installed Chrome for Testing 153.0.8010.12
  through a scratch `PLAYWRIGHT_BROWSERS_PATH`, because `cdn.playwright.dev` was
  blocked. They are exploratory, not pinned-browser evidence: proof ×5 (15 passed),
  negative control (runner exit 1), core ×3 (15 passed), phase2 ×5 (15 passed) and
  the installed-tarball smoke (browser PASS; controls exit 0/1/2/2). Before the
  version pin both checkers accepted these reports; afterwards both reject them
  (actual `153.0.8010.12`, expected `158.0.8127.18`), as intended. No evidence
  files from these runs are committed.

CI on the pinned browser must still confirm these changes.
