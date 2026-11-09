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

Pending push at the time of this initial report. The new workflow must install
the tarball in a fresh consumer, invoke its executable and doctor, initialize the
project, and run both generated smoke and first-party UI/lifecycle tests against
real Chromium. Both tests must pass with actual browser-version/extension metadata.
The workflow also checks all CLI outcome controls and verifies package contents.
Phase 0, 1 and 2 browser workflows must remain green on the same source.

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
A draft PR will be attempted only after the implementation is pushed; no PR
number or creation success is claimed yet.
