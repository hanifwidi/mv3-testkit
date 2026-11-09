## Phase 0 technical proof of concept

Adds a private, pinned TypeScript/pnpm project with Vitest and Playwright, two MV3 counter fixtures, and an experimental CDP lifecycle probe. A verdict requires observed stop, running state after a real runtime message, and changed boot identity. The persistent fixture preserves state; the deliberately volatile fixture loses it. Missing evidence stays INCONCLUSIVE and fails acceptance.

Includes isolated-world content-script coverage, a negative-control project, evidence checker, JSON timeline, reproducible commands, and Ubuntu 24.04 CI. No public API, CLI, npm publishing, merge, or subsequent development phase is included.

## Verification

[CI run 42575203864](https://github.com/hanifwidi/mv3-testkit/actions/runs/42575203864) succeeded on implementation commit `db15bb3988ab5fa28212b14449de3fa68e3bda05`:

- Frozen install, bundled Chromium install, typecheck, and 8 Vitest tests.
- Three real-browser tests repeated five times with no retries.
- Negative runner exit 1 plus checker success requiring observed restart and state loss; infrastructure failures are rejected.
- Evidence artifact uploaded as `phase-0-evidence`.

Public per-step conclusions were verified and saved. Raw CI logs/JSON require GitHub sign-in and were not downloaded in this session. Local cloud browser runs remain INCONCLUSIVE because download policy blocks the bundled browser and managed system Chromium blocks unpacked extensions. Their actual failures are retained.

**Recommendation: technical GO for the next phase on the pinned CI configuration, subject to maintainer review.** Natural idle and broader platform reliability remain unverified; competitor/user research is outstanding. No release is approved.

Full report: [docs/verification.md](https://github.com/hanifwidi/mv3-testkit/blob/feat/phase-0-lifecycle-poc/docs/verification.md). Design/limits: [docs/lifecycle.md](https://github.com/hanifwidi/mv3-testkit/blob/feat/phase-0-lifecycle-poc/docs/lifecycle.md). Reproduction: [docs/reproduction.md](https://github.com/hanifwidi/mv3-testkit/blob/feat/phase-0-lifecycle-poc/docs/reproduction.md).
