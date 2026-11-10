# MV3 TestKit — experimental TypeScript core

Real-browser research into Manifest V3 service-worker state loss. This is a private,
unreleased TypeScript toolkit. The Phase 0 proof is retained alongside the
[Phase 1 engine and local doctor command](docs/phase-1.md).

**Phase 0 technical result: PASS on Ubuntu 24.04 CI.**
The fivefold browser suite and evidence-checked negative control succeeded in
[GitHub Actions](https://github.com/hanifwidi/mv3-testkit/actions/runs/42575203864).
Local cloud browser runs remain INCONCLUSIVE due to network/browser policies.
See the [verification report and evidence limits](docs/verification.md).
Phase 1 has a [separate verification report](docs/phase-1-verification.md).
The [Phase 2 lifecycle and fixture work](docs/phase-2.md) has its own
[verification report](docs/phase-2-verification.md); results are tracked per phase.
The [Phase 3 local-alpha quickstart](docs/quickstart.md) covers CLI setup, reports
and installing the private tarball. No npm release has been published.
See [Phase 3 verification](docs/phase-3-verification.md) for actual outcomes.

Requires Node 24, pnpm 11.25.0, and a Playwright-supported OS. Start in this checkout:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm test
pnpm test:repeat
pnpm run doctor --extension test-extensions/healthy-counter
```

The default suite expects the persistent fixture to produce `PASS` and the broken
fixture to produce `FAIL`. Both detector tests must pass. Every lifecycle verdict
requires an observed CDP stop, running state after a real message, and a new boot
identity. Missing evidence produces `INCONCLUSIVE` and fails the acceptance test.

Run the separate negative control to see an ordinary persistence assertion fail:

```sh
# Remove old output first so a runner that fails early cannot leave a stale report:
rm -rf artifacts/negative artifacts/negative-html
set +e
POC_OUTPUT_DIR=artifacts/negative pnpm test:negative
result=$?
set -e
test "$result" -eq 1   # the persistence assertion must fail
# Must exit 0: confirms the failure is real state loss after an observed restart.
node scripts/check-negative.mjs artifacts/negative
```

The checker rejects infrastructure failures; a nonzero runner exit by itself
does not demonstrate detection. Playwright clears the selected output directory
on each run. Preserve reports before reusing that directory. The negative control
defaults to `artifacts/negative`, so it never clears the main suite's `test-results/`.
JSON timelines are attached to tests and written to `<output-directory>/<test>/evidence.json`;
HTML is generated in `playwright-report/`, or in `<output-directory>-html/` when
`POC_OUTPUT_DIR` is set. All reports stay local.

See [lifecycle design and limits](docs/lifecycle.md) and [reproduction/troubleshooting](docs/reproduction.md).
The `doctor`, `init`, `test` CLI and source API are experimental. Public npm
publishing, natural-idle guarantees, and the full release gate remain outstanding.
