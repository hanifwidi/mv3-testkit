## Phase 2 lifecycle and regression fixtures

Extends the Phase 1 engine with ordered lifecycle phases tied to CDP event cursors,
partial INCONCLUSIVE evidence, popup/options document helpers and allowlisted
local/session storage reads. Adds invalid-manifest, popup/options and controlled
late-listener fixtures. No user-extension permission or boot identity is injected.

This PR is stacked on `feat/phase-1-core-engine` while Phase 1 PR #2 remains a draft.
Review/merge the prerequisites separately; do not automatically merge this PR.

## Verification

Local TypeScript/build passed, 115 unit/integration tests passed, and 21 evidence
validator tests passed. Invalid-manifest preflight passed without launching a
browser. Implementation commit `09b9b2d` passed all three CI workflows:

- [Phase 2](https://github.com/hanifwidi/mv3-testkit/actions/runs/42614046489): all three acceptance cases repeated five times.
- [Phase 1](https://github.com/hanifwidi/mv3-testkit/actions/runs/42614043698): all five core cases repeated three times.
- [Phase 0](https://github.com/hanifwidi/mv3-testkit/actions/runs/42614043588): repeated proof suite, negative control and ordered evidence gate.

All artifact uploads succeeded. Public per-step conclusions were verified and
saved; raw CI payloads were not downloaded in this session. Recommendation:
**technical GO on the pinned configuration**, subject to maintainer review.

The Phase 2 gate repeats three acceptance cases five times without retries,
including actual document/storage restart and controlled late-listener messaging.
Phase 0 and Phase 1 gates also run. Missing lifecycle evidence fails acceptance.

The late-listener case uses a controlled registration gate and a storage-event
wake, with a positive messaging control after reopening the gate. It does not
claim to reproduce every production race. Opening the popup document is not
toolbar-popup automation. Natural idle, worker updates and other platforms are
unverified. No Phase 3 work, publishing or release is included.

Full verification: [docs/phase-2-verification.md](https://github.com/hanifwidi/mv3-testkit/blob/feat/phase-2-lifecycle-fixtures/docs/phase-2-verification.md).
Design/API/limits: [docs/phase-2.md](https://github.com/hanifwidi/mv3-testkit/blob/feat/phase-2-lifecycle-fixtures/docs/phase-2.md).
