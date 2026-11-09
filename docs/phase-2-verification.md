# Phase 2 verification

9 November 2026. Source branch `feat/phase-2-lifecycle-fixtures`, based on tested
Phase 1 commit `6ab08cf`. Review base is `feat/phase-1-core-engine` until PR #2
is merged; this keeps Phase 2 changes separate from the existing Phase 1 draft.
No main push, automatic merge, npm release or Phase 3 work is authorized by this report.

## Local results

| Command | Actual result |
| --- | --- |
| `pnpm typecheck` | Exit 0 |
| `pnpm build` | Exit 0 |
| `pnpm test:unit` | 115 passed in 10 files, 0 failed/skipped |
| `node --test scripts/check-evidence.test.mjs` | 21 passed, 0 failed/skipped |
| `pnpm exec playwright test --project=phase2 --grep 'invalid manifest'` | 1 preflight control passed; no browser was launched |
| `pnpm exec playwright test --project=phase2 --list` | Exactly 3 acceptance cases selected |
| `git diff --check` | Exit 0 |

Unit/integration tests use controlled fake adapters and synthetic evidence; these
are not real-browser lifecycle proof. This cloud instance still has the restricted
network policy and no bundled Chromium. Full browser validation must run on the
actual CI runner rather than silently switching to a policy-managed system browser.

## Browser gate

**PASS on the pinned Ubuntu 24.04 CI configuration**, source commit `09b9b2d`.
All three push workflows have successful conclusions for every job step:

- [Phase 2 run 42614046489](https://github.com/hanifwidi/mv3-testkit/actions/runs/42614046489):
  frozen install, bundled Chromium, build/typecheck/unit suites and three acceptance
  cases repeated five times. This configures fifteen cases: ten browser scenarios
  and five preflight controls. Tests require actual document rendering, preserved
  local/session counters after a verified restart, and a controlled messaging FAIL
  after cold start followed by successful explicit listener registration.
- [Phase 1 run 42614043698](https://github.com/hanifwidi/mv3-testkit/actions/runs/42614043698):
  five core cases repeated three times, including healthy/volatile state handling,
  nested workers, actual doctor readiness and a missing-browser control.
- [Phase 0 run 42614043588](https://github.com/hanifwidi/mv3-testkit/actions/runs/42614043588):
  three proof tests repeated five times, the expected negative-control failure,
  and ordered CDP evidence validation all succeeded.

All artifact upload steps succeeded. [Captured public step metadata](evidence/ci-phase-2-09b9b2d.json)
records exact source commit, retrieval time and individual conclusions. Raw logs,
boot IDs and attachments were not downloaded from GitHub in this session; these
are verified command conclusions, not a fabricated JSON payload transcript.
The test sources have no skips, expected-failure annotations or automatic retries.
Configured repetition counts and assertion outcomes are inferred from those test
sources and successful commands. The controlled messaging FAIL is a diagnostic
that the acceptance test asserts, not a hidden failing runner result.

**Recommendation: technical GO for Phase 2 on this pinned configuration, subject
to maintainer review.** Natural-idle and release readiness are not established.

The new workflow uploads `phase-2-evidence` with Playwright results, lifecycle JSON
and fixture diagnostic attachments. Public step conclusions must be distinguished
from raw artifact payloads if authentication prevents download.

## Scope and limits

The experimental evidence API now includes ordered phases/cursors and retains
partial failure evidence. Helper storage reads are opt-in by key and never logged
automatically. See [design and controlled-fixture limitations](phase-2.md).
The late-listener test proves a controlled registration gap after a storage-event
wake, not every production timing race or runtime-message cold-start mechanism.
Natural idle, other platforms, toolbar popup semantics and worker updates remain
unverified. No general reliability or release claim is made.

## Review delivery

The tested branch is pushed. `gh pr create --draft`, with base
`feat/phase-1-core-engine`, was attempted and returned exit 1: POST
`https://api.github.com/graphql` Forbidden. Existing Git read/push works; this is
an observed API access denial, not evidence that another Git credential is needed.
A new PR has **not** been created or assigned a number in this session.

[Open the Phase 2 comparison](https://github.com/hanifwidi/mv3-testkit/compare/feat/phase-1-core-engine...feat/phase-2-lifecycle-fixtures?expand=1)
and use the [prepared description](phase-2-pr-body.md) to create a draft manually,
or retry after the running environment's API access is enabled:

```sh
gh pr create --repo hanifwidi/mv3-testkit --draft \
  --base feat/phase-1-core-engine --head feat/phase-2-lifecycle-fixtures \
  --title "Phase 2: observed lifecycle, context helpers and regression fixtures" \
  --body-file docs/phase-2-pr-body.md
```

Review/merge Phase 1 separately before integrating this stacked Phase 2 branch.
No main update, PR merge, npm publication or Phase 3 work was performed.
