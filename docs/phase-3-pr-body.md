## Phase 3 private local alpha and developer workflow

Adds non-overwriting `mv3tk init`, Playwright-backed `mv3tk test`, explicit outcome
counts, fresh whitelisted HTML/JSON reports, ESM/bin packaging, and a first-party
counter extension. The package stays **private** and **UNLICENSED**; nothing is
published to npm. This branch stacks on `feat/phase-2-lifecycle-fixtures`.

Verification: lint/typecheck/build passed; 133 unit/integration tests and 21
evidence tests passed. The local tarball was installed in a fresh consumer, whose
actual CLI preserved assertion-failure exits and reported all-skipped/flaky runs
as INCONCLUSIVE. Local browser checks were not run. Source commit `76dedcd`
subsequently passed the [Phase 3 installed-consumer workflow](https://github.com/hanifwidi/mv3-testkit/actions/runs/42618559124)
with actual Chromium, doctor readiness and both generated discovery and counter
UI/restart tests. Phase 0, 1 and 2 CI also passed on that source. Public per-step
conclusions were verified and saved; raw CI payloads were not downloaded in this
session. Recommendation: **technical GO for private/local alpha**, subject to review.

Security review found and remediated one moderate minimatch advisory in dev-only
lint dependencies. The subsequent audit snapshot reports zero findings. The
tooling override's compatibility was checked with lint/build/tests; this is a
bounded review, not a universal security guarantee.

The Phase 3 workflow installs the artifact and runs the generated smoke test plus
the first-party UI/worker-restart test in real Chromium. Existing Phase 0–2 gates
must also pass. This is first-party dogfooding, not independent production adoption.

Full verification: [docs/phase-3-verification.md](https://github.com/hanifwidi/mv3-testkit/blob/feat/phase-3-cli-prerelease/docs/phase-3-verification.md).
[Quickstart](https://github.com/hanifwidi/mv3-testkit/blob/feat/phase-3-cli-prerelease/docs/quickstart.md),
[security boundaries](https://github.com/hanifwidi/mv3-testkit/blob/feat/phase-3-cli-prerelease/docs/security-review.md).
No public beta, automatic merge or Phase 4 action is included.


Final security follow-up `15e9ffb` strengthens sensitive metadata redaction for
Bearer credentials, cookie lists and multiword values. The regression test failed
before correction; all 133 tests and [fresh installed-browser CI](https://github.com/hanifwidi/mv3-testkit/actions/runs/42619309906)
passed afterward, alongside Phase 0–2. Details and captured step metadata are in
the verification report.
