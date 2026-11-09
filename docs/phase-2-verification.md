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

Pending push/CI at the time of this initial report. Required: Phase 0, Phase 1 and
Phase 2 workflows all pass on the new source. The Phase 2 project runs five
repetitions with retries disabled: popup/options plus storage restart, controlled
late-listener cold start plus positive recovery, and invalid-manifest preflight.
The existing workflows continue to check healthy persistence and volatile-state
loss. A failed observation is an inconclusive result, never successful bug detection.

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

The existing session previously denied GitHub API access. After pushing the tested
branch, draft PR creation will be attempted against `feat/phase-1-core-engine`.
If it remains blocked, the branch and prepared description will be available for
manual creation. No PR number is claimed until creation is confirmed.
